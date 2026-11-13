import test from "node:test";
import assert from "node:assert/strict";
import { createCommentsService } from "./service.js";
import { createCommentsRepository } from "./repository.js";
import { createPersistentRateLimiter } from "../../lib/window-rate-limiter.js";

function fixture({ moderation = "first_time", blocklist = [], commentLimiter = null } = {}) {
  const rows = [];
  let nextId = 1;
  const repository = {
    async postForComments() { return { id: 1, status: "published", published_at: new Date(), deleted_at: null, allow_comments: 1, close_after_days: 0 }; },
    async approvedCommentExists(email) { return rows.some((row) => row.email === email && row.status === "approved"); },
    async repeatedComment(postId, voterHash, body) { return rows.some((row) => row.postId === postId && row.voterHash === voterHash && row.body === body); },
    async recentCommentCount(voterHash) { return rows.filter((row) => row.voterHash === voterHash).length; },
    async parentDepth() { return 1; },
    async approvedParent(postId, parentId) { return postId === 1 && rows.some((row) => row.id === parentId && row.status === "approved") ? { id: parentId, post_id: postId } : null; },
    async insertComment(comment) { rows.push({ ...comment, id: nextId++ }); return rows.at(-1).id; },
    async listApproved() { return []; }, async voteComment() { return true; }, async moderate() { return true; },
  };
  const service = createCommentsService(repository, { async get() { return { comments: { moderation, blocklist } }; } }, { allow() { return true; } }, commentLimiter);
  const input = (extra = {}) => ({ postId: 1, name: "Reader", email: "reader@example.test", body: `Comment ${nextId}`, voterHash: "visitor", elapsedMs: 6000, ...extra });
  return { service, rows, input };
}

test("comment submissions persist a five-per-ten-minute visitor limit", async () => {
  let attempted;
  const limiter = createPersistentRateLimiter({ async incrementRateLimit(...args) { attempted = args; return { allowed: false }; } }, 5, 10 * 60 * 1000, "comment");
  const { service, rows, input } = fixture({ commentLimiter: limiter });
  await assert.rejects(service.submit(input()), { status: 429 });
  assert.match(attempted[0], /^comment:[a-f0-9]{64}$/u);
  assert.equal(attempted[1], 5);
  assert.equal(attempted[2], 10 * 60 * 1000);
  assert.equal(rows.length, 0);
});

test("first comment waits and a later comment from the approved email is auto-approved", async () => {
  const { service, rows, input } = fixture();
  assert.equal((await service.submit(input())).visible, false);
  rows[0].status = "approved";
  assert.equal((await service.submit(input())).visible, true);
});

test("honeypot accepts silently and does not store the submission", async () => {
  const { service, rows, input } = fixture();
  assert.deepEqual(await service.submit(input({ honeypot: "filled" })), { accepted: true, visible: false });
  assert.equal(rows.length, 0);
});

test("fast and linked comments wait for moderation", async () => {
  const fast = fixture();
  assert.equal((await fast.service.submit(fast.input({ elapsedMs: 4999 }))).visible, false);
  const linked = fixture();
  assert.equal((await linked.service.submit(linked.input({ body: "Visit https://example.test" }))).visible, false);
});

test("comment blocklist forces moderation and duplicate text is rejected", async () => {
  const blocked = fixture({ moderation: "none", blocklist: ["scam"] });
  assert.equal((await blocked.service.submit(blocked.input({ body: "scam post" }))).visible, false);
  const duplicate = fixture({ moderation: "none" });
  const first = duplicate.input({ body: "same text" });
  await duplicate.service.submit(first);
  await assert.rejects(duplicate.service.submit(first), { status: 409 });
});

test("five comments per visitor in ten minutes are rate limited", async () => {
  const { service, input } = fixture({ moderation: "none" });
  for (let i = 0; i < 5; i += 1) { await service.submit(input({ body: `comment ${i}` })); }
  await assert.rejects(service.submit(input({ body: "sixth comment" })), { status: 429 });
});

test("staff replies are immediately approved and carry the staff marker", async () => {
  const { service, rows } = fixture({ moderation: "none" });
  const original = await service.submit({ postId: 1, name: "Reader", email: "reader@example.test", body: "Original comment", voterHash: "reader", elapsedMs: 6000 });
  const id = rows.find((row) => row.id === original.id).id;
  rows.find((row) => row.id === id).status = "approved";
  await service.staffReply({ postId: 1, parentId: id, body: "Team reply", staffName: "Editor", staffEmail: "editor@example.test" });
  const reply = rows.at(-1);
  assert.equal(reply.status, "approved");
  assert.equal(reply.isStaff, true);
});

test("reader replies deeper than level three attach to the level-three comment", async () => {
  let inserted;
  const repository = {
    async postForComments() { return { id: 1, status: "published", published_at: new Date(), allow_comments: 1, close_after_days: 0 }; },
    async recentCommentCount() { return 0; }, async repeatedComment() { return false; }, async parentDepth() { return 3; },
    async levelThreeParent() { return 77; }, async insertComment(comment) { inserted = comment; return 3; },
  };
  const service = createCommentsService(repository, { async get() { return { comments: { moderation: "none" } }; } }, { allow() { return true; } });
  await service.submit({ postId: 1, parentId: 99, name: "Reader", email: "reader@example.test", body: "A reply", voterHash: "visitor", elapsedMs: 6000 });
  assert.equal(inserted.parentId, 77);
});

test("closed or expired comment windows keep comments readable but stop new comments", async () => {
  const repository = {
    async postForComments() { return { id: 1, status: "published", published_at: new Date(Date.now() - 5 * 86400000), allow_comments: 1, close_after_days: 2 }; },
  };
  const service = createCommentsService(repository, { async get() { return { comments: {} }; } }, { allow() { return true; } });
  assert.equal(await service.canComment(1), false);
});

test("comment vote replacement recalculates the score from distinct visitor rows", async () => {
  const votes = new Map();
  let score = 0;
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql, values) {
      if (sql.startsWith("SELECT id FROM comments")) { return [[{ id: Number(values[0]) }]]; }
      if (sql.startsWith("INSERT INTO comment_votes")) { votes.set(`${values[0]}:${values[1]}`, Number(values[2])); return [{ affectedRows: 1 }]; }
      if (sql.startsWith("UPDATE comments SET vote_score")) { score = [...votes.entries()].filter(([key]) => key.startsWith(`${values[0]}:`)).reduce((sum, [, value]) => sum + value, 0); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const repository = createCommentsRepository({ getConnection: async () => connection });
  await repository.voteComment(3, "visitor", 1);
  await repository.voteComment(3, "visitor", -1);
  assert.equal(votes.size, 1);
  assert.equal(score, -1);
});

test("comment settings read the comments closeAfterDays key and require a current published post", async () => {
  let call;
  const repository = createCommentsRepository({ async execute(sql, values) { call = { sql, values }; return [[{ id: 1, close_after_days: 0 }]]; } });
  await repository.postForComments(1);
  assert.match(call.sql, /\$\.closeAfterDays/u);
  assert.match(call.sql, /published_at <= UTC_TIMESTAMP\(\)/u);
  assert.match(call.sql, /status = \?/u);
  assert.deepEqual(call.values, ["comments", 1, "published"]);
});
