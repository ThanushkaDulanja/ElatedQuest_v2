import assert from "node:assert/strict";
import test from "node:test";
import { createContactService } from "./service.js";
import { createContactRepository } from "./repository.js";
import { createPersistentRateLimiter } from "../../lib/window-rate-limiter.js";

function fixture() {
  let current = 20_000;
  const rows = { messages: [], stories: [] };
  const mails = [];
  const repository = {
    async createMessage(row) { rows.messages.push(row); return rows.messages.length; },
    async createStory(row) { rows.stories.push(row); return rows.stories.length; },
    async readStoryForConversion(id) { return rows.stories.find((story) => story.id === id) ?? { id: 1, name: "Reader", title: "Reader story", body_text: "A".repeat(100), links_text: "https://example.test" }; },
    async convertStory(id, actorId, content) { rows.converted = { id, actorId, content }; return { postId: 17, title: "Reader story" }; },
    async setStoryStatus() { return true; }, async setMessageStatus() { return true; }, async listStories() { return []; }, async listMessages() { return []; },
  };
  const service = createContactService({ repository, emailer: {
    async sendContactMessage(...args) { mails.push(["message", ...args]); },
    async sendStorySubmission(...args) { mails.push(["story", ...args]); },
    async sendStoryReceipt(...args) { mails.push(["receipt", ...args]); },
  }, rateLimiter: { allow() { return true; } }, contactEmail: "owner@example.test", submissionsEmail: "stories@example.test", now: () => current });
  const context = { ip: "192.0.2.5", userAgent: "Browser", startedAt: 10_000 };
  return { service, rows, mails, context, setNow(value) { current = value; } };
}

test("contact message stores and emails owner without sending a receipt", async () => {
  const { service, rows, mails, context } = fixture();
  const result = await service.submit({ type: "message", name: "Reader", email: " READER@example.test ", subject: "Hello", message: "A message long enough." }, context);
  assert.equal(result.type, "message");
  assert.equal(rows.messages[0].email, "reader@example.test");
  assert.equal(mails.length, 1);
  assert.equal(mails[0][1], "owner@example.test");
});

test("story submission stores and sends editor notice plus reader receipt", async () => {
  const { service, rows, mails, context } = fixture();
  const result = await service.submit({ type: "story", name: "Reader", email: "reader@example.test", title: "A story", body: "A".repeat(100), links: "https://example.test\n", terms: "on" }, context);
  assert.equal(result.type, "story");
  assert.equal(rows.stories[0].links.length, 1);
  assert.deepEqual(mails.map((mail) => mail[0]), ["story", "receipt"]);
});

test("honeypot stores and emails nothing; short form is rejected", async () => {
  const { service, rows, mails, context } = fixture();
  assert.deepEqual(await service.submit({ honeypot: "filled" }, context), { accepted: true, silent: true });
  assert.equal(rows.messages.length + rows.stories.length + mails.length, 0);
  await assert.rejects(service.submit({ type: "message" }, { ...context, startedAt: 19_000 }), { status: 400 });
});

test("story and contact forms use separate per-visitor hourly rate-limit buckets", async () => {
  const buckets = [];
  const limiter = createPersistentRateLimiter({ async incrementRateLimit(key, limit, windowMs) { buckets.push({ key, limit, windowMs }); return { allowed: true }; } }, 3, 60 * 60 * 1000, "form");
  const { context } = fixture();
  const limitedService = createContactService({
    repository: { async createMessage() { return 1; }, async createStory() { return 1; } },
    emailer: { async sendContactMessage() {}, async sendStorySubmission() {}, async sendStoryReceipt() {} },
    rateLimiter: limiter,
    contactEmail: "owner@example.test",
    submissionsEmail: "stories@example.test",
    now: () => 20_000,
  });
  await limitedService.submit({ type: "message", name: "Reader", email: "reader@example.test", subject: "Hello", message: "A message long enough." }, context);
  await limitedService.submit({ type: "story", name: "Reader", email: "reader@example.test", title: "A story", body: "A".repeat(100), terms: "on" }, context);
  assert.match(buckets[0].key, /^form:message:[a-f0-9]{64}$/u);
  assert.match(buckets[1].key, /^form:story:[a-f0-9]{64}$/u);
  assert.equal(buckets[0].limit, 3);
  assert.equal(buckets[0].windowMs, 60 * 60 * 1000);
});

test("story conversion sanitizes generated HTML and carries guest submission into draft service", async () => {
  const { service, rows } = fixture();
  assert.deepEqual(await service.convertStory(1, 8, "192.0.2.5"), { postId: 17, title: "Reader story" });
  assert.equal(rows.converted.actorId, 8);
  assert.match(rows.converted.content.html, /<p>/u);
  assert.doesNotMatch(rows.converted.content.html, /<script>/u);
});

test("story conversion transaction creates a guest author and unpublished draft, then accepts the submission", async () => {
  const calls = [];
  let committed = false;
  const connection = {
    async beginTransaction() {}, async commit() { committed = true; }, async rollback() { assert.fail("conversion should commit"); }, release() {},
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT id, name, title")) { return [[{ id: 3, name: "Reader", title: "A reader story", body_text: "Text", links_text: null }]]; }
      if (sql.startsWith("INSERT INTO authors")) { return [{ insertId: 11 }]; }
      if (sql.startsWith("INSERT INTO posts")) { return [{ insertId: 17 }]; }
      return [{ affectedRows: 1 }];
    },
  };
  const repository = createContactRepository({ getConnection: async () => connection });
  const result = await repository.convertStory(3, 8, { excerpt: "Short", html: "<p>Safe</p>", text: "Safe text", readingMinutes: 1 }, "192.0.2.8");
  assert.equal(result.postId, 17);
  assert.equal(committed, true);
  assert.deepEqual(calls[1].values, ["Reader", "guest-story-3"]);
  assert.match(calls[2].sql, /'draft'/u);
  assert.equal(calls[2].values[6], 11);
  assert.equal(calls[2].values[7], 8);
  assert.deepEqual(calls[3].values, ["accepted", 17, 8, 3]);
});
