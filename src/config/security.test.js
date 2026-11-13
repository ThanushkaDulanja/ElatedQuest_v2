import assert from "node:assert/strict";
import test from "node:test";
import { buildContentSecurityPolicy } from "./security.js";

test("CSP includes nonce, analytics, uploads and only enabled ad origins", () => {
  const policy = buildContentSecurityPolicy({ nonce: "test-nonce", uploadsOrigin: "https://media.example.test", analytics: true, sentryOrigin: "https://errors.example.test", adsense: true, customImageOrigins: ["https://custom.example.test"] });
  assert.match(policy, /script-src 'self' 'nonce-test-nonce' https:\/\/plausible\.io https:\/\/pagead2\.googlesyndication\.com/u);
  assert.match(policy, /img-src[^;]*https:\/\/media\.example\.test[^;]*https:\/\/custom\.example\.test/u);
  assert.match(policy, /frame-ancestors 'none'/u);
  assert.match(policy, /connect-src[^;]*https:\/\/errors\.example\.test/u);
  const noAds = buildContentSecurityPolicy({ nonce: "n", uploadsOrigin: "https://media.example.test" });
  assert.doesNotMatch(noAds, /googlesyndication|doubleclick|plausible/u);
});
