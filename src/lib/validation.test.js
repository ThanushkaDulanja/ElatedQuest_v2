import assert from "node:assert/strict";
import test from "node:test";
import { APP_LIMITS } from "../config/constants.js";
import { isWithinLength } from "./validation.js";

test("central application text limits count Unicode code points", () => {
  assert.equal(APP_LIMITS.postTitle, 120);
  assert.equal(APP_LIMITS.storyTitle, 120);
  assert.equal(APP_LIMITS.seoTitle, 60);
  assert.equal(APP_LIMITS.metaDescription, 160);
  assert.equal(APP_LIMITS.excerpt, 200);
  assert.equal(isWithinLength("🎉".repeat(120), APP_LIMITS.postTitle), true);
  assert.equal(isWithinLength("🎉".repeat(121), APP_LIMITS.postTitle), false);
});
