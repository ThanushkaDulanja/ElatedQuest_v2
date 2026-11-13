import assert from "node:assert/strict";
import test from "node:test";
import { createPersistentRateLimiter, createWindowRateLimiter } from "./window-rate-limiter.js";

test("in-memory limiter respects its rolling time window", () => {
  let now = 0;
  const limiter = createWindowRateLimiter(1, 1000, () => now);
  assert.equal(limiter.allow("x"), true);
  assert.equal(limiter.allow("x"), false);
  now = 1001;
  assert.equal(limiter.allow("x"), true);
});

test("persistent limiter namespaces visitor counters and keeps them hashed", async () => {
  const keys = [];
  const limiter = createPersistentRateLimiter({ async incrementRateLimit(key, limit, windowMs) { keys.push([key, limit, windowMs]); return { allowed: keys.length === 1 }; } }, 3, 3_600_000, "form");
  assert.equal(await limiter.allow("visitor-hash", "story"), true);
  assert.equal(await limiter.allow("visitor-hash", "contact"), false);
  assert.match(keys[0][0], /^form:story:[a-f0-9]{64}$/u);
  assert.doesNotMatch(keys[0][0], /visitor-hash/u);
  assert.equal(keys[0][1], 3);
  assert.equal(keys[0][2], 3_600_000);
});
