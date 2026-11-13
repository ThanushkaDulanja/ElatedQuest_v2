import assert from "node:assert/strict";
import test from "node:test";
import { scrubSentryEvent } from "./sentry-scrub.js";

test("Sentry sanitizer removes reader PII, request secrets, and sensitive URL query data", () => {
  const event = { request: { url: "https://site.example.test/sign-in?token=abc&email=reader@example.test", query_string: "token=abc", headers: { cookie: "sid=secret" }, data: { email: "reader@example.test" } }, user: { email: "reader@example.test", id: "42" }, message: "Failed for reader@example.test?code=xyz", logentry: { message: "bad token=private" }, exception: { values: [{ value: "Access token=secret" }] }, breadcrumbs: [{ data: { url: "https://site.example.test/callback?state=private", request_body: "private" } }] };
  const clean = scrubSentryEvent(event);
  assert.equal(clean.request.url, "https://site.example.test/sign-in");
  assert.equal("query_string" in clean.request, false);
  assert.equal("headers" in clean.request, false);
  assert.equal(clean.user.email, undefined);
  assert.equal(clean.user.id, "42");
  assert.doesNotMatch(clean.message, /reader@example.test|xyz/u);
  assert.doesNotMatch(clean.logentry.message, /private/u);
  assert.doesNotMatch(clean.exception.values[0].value, /secret/u);
  assert.equal(clean.breadcrumbs[0].data.url, "https://site.example.test/callback");
  assert.equal("request_body" in clean.breadcrumbs[0].data, false);
});
