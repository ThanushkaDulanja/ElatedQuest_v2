import assert from "node:assert/strict";
import test from "node:test";
import { createAdsController } from "./controller.js";
import { createAdsService, sanitizeAdHtml } from "./service.js";

test("custom ad HTML keeps safe tags and HTTPS links while stripping script and event attributes", () => {
  const safe = sanitizeAdHtml('<div class="promo" onclick="alert(1)"><a href="javascript:alert(1)">bad</a><a href="https://ads.example/offer" onmouseover="bad()"><img src="https://ads.example/ad.webp" onerror="bad()" alt="Offer"></a><script>steal()</script><iframe src="https://evil.example"></iframe></div>');
  assert.match(safe, /href="https:\/\/ads\.example\/offer"/u);
  assert.match(safe, /src="https:\/\/ads\.example\/ad\.webp"/u);
  assert.doesNotMatch(safe, /javascript:|onclick|onmouseover|onerror|script|iframe|steal/u);
});

test("ads service exposes no snippet in public settings, returns slot code, and generates ads.txt", async () => {
  const settingsService = { async get() { return { ads: { enabled: true, publisherId: "pub-1234567890123456", slots: { home_feed: { enabled: true, provider: "adsense", slotId: "12345" }, home_sidebar: { enabled: true, provider: "custom", customHtml: '<a href="https://ads.example">Sidebar offer</a>' }, post_end: { enabled: true, provider: "custom", customHtml: '<a href="https://ads.example">Offer</a><script>bad()</script>' } } } }; } };
  const service = createAdsService(settingsService);
  const publicConfig = await service.publicSettings();
  assert.equal(publicConfig.slots.home_feed.enabled, true);
  assert.equal(publicConfig.slots.home_sidebar.enabled, true);
  assert.equal(JSON.stringify(publicConfig).includes("customHtml"), false);
  assert.deepEqual(await service.slot("home_feed"), { provider: "adsense", publisherId: "pub-1234567890123456", slotId: "12345", html: "" });
  assert.match((await service.slot("home_sidebar")).html, /Sidebar offer/u);
  assert.match((await service.slot("post_end")).html, /Offer/u);
  assert.doesNotMatch((await service.slot("post_end")).html, /script/u);
  assert.equal(await service.adsTxt(), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  assert.equal(await service.slot("not-a-slot"), null);
});

test("public ad endpoint rejects missing consent before reading slot config", async () => {
  let reads = 0;
  const controller = createAdsController({ async slot() { reads += 1; return { provider: "custom", html: "" }; } });
  const response = { headers: {}, set(values) { this.headers = values; return this; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await controller.slot({ cookies: {}, params: { slot: "home_feed" } }, response, assert.fail);
  assert.equal(response.statusCode, 403);
  assert.equal(reads, 0);
});

test("ad Content-Security-Policy adds only enabled provider origins", async () => {
  const settingsService = { async get() { return { ads: { enabled: true, publisherId: "pub-1234567890123456", slots: { post_end: { enabled: true, provider: "custom", customHtml: '<img src="https://media.ads.example/ad.webp" alt="Ad">' } } } }; } };
  const service = createAdsService(settingsService);
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  await service.publicSettings(response, ["post_end"]);
  const policy = response.headers["Content-Security-Policy"];
  assert.match(policy, /img-src[^;]*https:\/\/media\.ads\.example/u);
  assert.doesNotMatch(policy, /https:\s/u);
  assert.doesNotMatch(policy, /pagead2\.googlesyndication\.com/u);
  const adsense = createAdsService({ async get() { return { ads: { enabled: true, publisherId: "pub-1234567890123456", slots: { home_feed: { enabled: true, provider: "adsense", slotId: "12345" } } } }; } });
  const adsenseResponse = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  await adsense.publicSettings(adsenseResponse, ["home_feed"]);
  assert.match(adsenseResponse.headers["Content-Security-Policy"], /script-src 'self'(?: 'nonce-[^']+')? https:\/\/pagead2\.googlesyndication\.com/u);
  assert.match(adsenseResponse.headers["Content-Security-Policy"], /frame-src https:\/\/googleads\.g\.doubleclick\.net/u);
});

test("disabled ads add no provider host to Content-Security-Policy", async () => {
  const service = createAdsService({ async get() { return { ads: { enabled: false, publisherId: "", slots: {} } }; } });
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  const config = await service.publicSettings(response, ["home_feed"]);
  assert.equal(config.enabled, false);
  assert.equal(response.headers["Content-Security-Policy"], undefined);
});
