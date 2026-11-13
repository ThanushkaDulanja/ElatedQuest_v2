import assert from "node:assert/strict";
import test from "node:test";
import { createBloggerController } from "./controller.js";

test("Blogger sync form redirects with feedback after syncing an existing post", async () => {
  let redirected;
  const controller = createBloggerController({ async retryPost(id) { assert.equal(id, "12"); return { status: "synced" }; } }, {});
  await controller.retry({ params: { id: "12" }, get: () => "text/html" }, { redirect(path) { redirected = path; } }, (error) => { throw error; });
  assert.equal(redirected, "/aadmin?blogger_synced=1");
});

test("Blogger sync API returns JSON to the post editor", async () => {
  let statusCode;
  let jsonBody;
  const controller = createBloggerController({ async retryPost() { return { status: "failed", message: "Blogger is unavailable." }; } }, {});
  const response = { status(code) { statusCode = code; return this; }, json(body) { jsonBody = body; } };
  await controller.retry({ params: { id: "12" }, get: () => "application/json" }, response, (error) => { throw error; });
  assert.equal(statusCode, 502);
  assert.deepEqual(jsonBody, { status: "failed", message: "Blogger is unavailable." });
});
