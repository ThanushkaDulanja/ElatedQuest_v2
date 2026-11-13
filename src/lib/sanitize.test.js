import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePostHtml } from "./sanitize.js";

test("post sanitizer strips script, events, dangerous URLs, embeds, h1 and inline style", () => {
  const cleaned = sanitizePostHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="/relative">relative</a><iframe src="https://evil.test"></iframe><p style="color:red" onclick="evil()">safe</p><h1>heading</h1>');
  assert.doesNotMatch(cleaned, /script|onerror|onclick|javascript:|iframe|style=|<h1/iu);
  assert.match(cleaned, /safe/u);
  assert.doesNotMatch(cleaned, /href="\/relative"/u);
});

test("post sanitizer keeps allowed media images and hardens external links", () => {
  const cleaned = sanitizePostHtml('<a href="https://example.test" target="_blank">link</a><img src="https://media.test/uploads/a.webp" alt="A">', "https://media.test/uploads/");
  assert.match(cleaned, /rel="noopener noreferrer"/u);
  assert.match(cleaned, /<img src="https:\/\/media\.test\/uploads\/a\.webp" alt="A"\s*\/>/u);
});

test("post sanitizer preserves supported image sizes and drops unknown size values", () => {
  const html = sanitizePostHtml('<p><img src="/uploads/a.webp" alt="A" data-image-size="small"><img src="/uploads/b.webp" alt="B" data-image-size="huge"></p>', "/uploads/");
  assert.match(html, /data-image-size="small"/u);
  assert.doesNotMatch(html, /data-image-size="huge"/u);
});

test("post sanitizer removes images without required alt text or from other hosts", () => {
  const cleaned = sanitizePostHtml('<img src="/uploads/a.webp"><img src="https://evil.test/a.webp" alt="bad">', "/uploads/");
  assert.doesNotMatch(cleaned, /<img/iu);
});
