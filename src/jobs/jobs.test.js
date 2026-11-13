import assert from "node:assert/strict";
import test from "node:test";
import { clear, get, set } from "../lib/cache.js";
import { createBloggerRetryJob } from "./bloggerRetry.js";
import { createPublishScheduledJob } from "./publishScheduled.js";
import { createJobsRepository } from "./repository.js";
import { createBloggerRepository } from "../modules/blogger/repository.js";

test("scheduled publisher publishes due rows atomically and invalidates rendered cache", async () => {
  const events = [];
  const connection = {
    async execute(sql, params) {
      events.push([sql, params]);
      if (sql.startsWith("SELECT id, slug, scheduled_at")) { return [[{ id: 12, slug: "scheduled-story", scheduled_at: new Date("2026-11-09T10:00:00Z") }]]; }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { events.push(["begin"]); },
    async commit() { events.push(["commit"]); },
    async rollback() { events.push(["rollback"]); },
    release() { events.push(["release"]); },
  };
  const database = { async getConnection() { return connection; }, async execute(sql, params) { events.push([sql, params]); return [[{ setting_value: { value: true } }]]; } };
  const repository = createJobsRepository(database);
  let synced = 0;
  set("html:/scheduled-story", "cached");
  const run = createPublishScheduledJob({ repository, bloggerService: { async syncPost(id) { assert.equal(id, 12); synced += 1; } } });
  assert.deepEqual(await run(), { published: 1 });
  assert.deepEqual(events.at(-1)[1], ["blogger_auto_sync"]);
  assert.ok(events.some(([sql]) => String(sql).includes("SKIP LOCKED")));
  assert.ok(events.some(([sql]) => String(sql).includes("post.publish")));
  assert.equal(synced, 1);
  assert.equal(get("html:/scheduled-story"), undefined);
});

test("Blogger retry worker selects only published retryable posts and caps attempts", async () => {
  let query;
  const repository = createBloggerRepository({ async execute(sql, params) { query = [sql, params]; return [[{ id: 3 }, { id: 4 }]]; } });
  assert.deepEqual(await repository.retryCandidates(25), [3, 4]);
  assert.match(query[0], /status = 'published'/u);
  assert.match(query[0], /blogger_sync_status IN \('pending', 'failed'\)/u);
  assert.match(query[0], /blogger_attempts < 5/u);
  assert.match(query[0], /needs_reconnect = 0/u);
  assert.deepEqual(query[1], [25]);
  const attempted = [];
  const run = createBloggerRetryJob({ repository: { async retryCandidates() { return [3, 4]; } }, bloggerService: { async retryPost(id) { attempted.push(id); } } });
  assert.deepEqual(await run(), { attempted: 2 });
  assert.deepEqual(attempted, [3, 4]);
  clear();
});
