import assert from "node:assert/strict";
import test from "node:test";
import { validateAds, validateMenuItems, validateSettings, validateSocialLinks } from "./validators.js";
import { createSettingsService } from "./service.js";
import { createSettingsRepository } from "./repository.js";

test("settings validator normalizes emails and validates rule options", () => {
  const values = validateSettings({ siteName: "ElatedQuest", contactEmail: " CONTACT@EXAMPLE.TEST ", submissionsEmail: " STORIES@EXAMPLE.TEST ", timezone: "UTC", moderation: "first_time", blocklist: "spam\nscam", closeAfterDays: "0" });
  assert.equal(values.general.contactEmail, "contact@example.test");
  assert.equal(values.blogger_auto_sync.value, false);
  assert.deepEqual(values.comments.blocklist, ["spam", "scam"]);
  assert.equal(values.comments.moderation, "first_time");
});

test("settings validator accepts an IANA time zone and rejects unknown zones", () => {
  const values = validateSettings({ siteName: "ElatedQuest", contactEmail: "contact@example.test", submissionsEmail: "stories@example.test", timezone: "Asia/Colombo", moderation: "all" });
  assert.equal(values.general.timezone, "Asia/Colombo");
  assert.equal(values.blogger_auto_sync.value, false);
  assert.throws(() => validateSettings({ siteName: "ElatedQuest", contactEmail: "contact@example.test", submissionsEmail: "stories@example.test", timezone: "Mars/Colombo", moderation: "all" }), /valid time zone/);
});

test("settings cache clears after save", async () => {
  let reads = 0;
  const service = createSettingsService({ async readAll() { reads += 1; return { reads }; }, async save() {} });
  await service.get(); await service.get();
  assert.equal(reads, 1);
  await service.update({}, 1, "127.0.0.1");
  await service.get();
  assert.equal(reads, 2);
});

test("settings update writes its audit action in the same transaction", async () => {
  const statements = [];
  const connection = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute(sql, parameters) { statements.push({ sql, parameters }); return [{}]; } };
  const repository = createSettingsRepository({ getConnection: async () => connection });
  await repository.save({ general: { siteName: "Site" } }, 9, "127.0.0.1");
  const event = statements.find((entry) => entry.sql.includes("settings.update"));
  assert.ok(event);
  assert.equal(event.parameters[0], 9);
  assert.equal(event.parameters[2], "127.0.0.1");
});

test("social and menu validators keep editable links safe and allow hidden empty social URLs", () => {
  const social = validateSocialLinks({ platform_0: "facebook", label_0: "Facebook", url_0: "", followers_0: "5k Fans", connected_0: "on", active_0: "on" });
  assert.equal(social[0].url, "");
  assert.equal(social[0].showConnected, true);
  assert.throws(() => validateSocialLinks({ platform_0: "facebook", label_0: "Facebook", url_0: "javascript:alert(1)" }), /valid HTTP\(S\)/u);
  const menus = validateMenuItems({ location_0: "footer", menu_label_0: "About", menu_url_0: "/about-us", menu_active_0: "on" });
  assert.equal(menus[0].url, "/about-us");
});

test("ads validator keeps all five slots off by default and validates enabled provider fields", () => {
  const off = validateAds({});
  assert.equal(off.enabled, false);
  assert.equal(Object.values(off.slots).filter((slot) => slot.enabled).length, 0);
  assert.throws(() => validateAds({ adsEnabled: "on", home_feed_enabled: "on", home_feed_provider: "adsense", home_feed_slotId: "abc" }), /publisher ID/u);
  const configured = validateAds({ adsEnabled: "on", publisherId: "pub-1234567890123456", home_feed_enabled: "on", home_feed_provider: "adsense", home_feed_slotId: "1234567890", post_end_enabled: "on", post_end_provider: "custom", post_end_customHtml: '<a href="https://ads.example/ad"><img src="https://ads.example/ad.webp" alt="Ad"></a>' });
  assert.equal(configured.slots.home_feed.slotId, "1234567890");
  const sidebar = validateAds({ adsEnabled: "on", publisherId: "pub-1234567890123456", home_sidebar_enabled: "on", home_sidebar_provider: "adsense", home_sidebar_slotId: "sidebar-123" });
  assert.equal(sidebar.slots.home_sidebar.enabled, true);
  assert.equal(sidebar.slots.home_sidebar.slotId, "sidebar-123");
  assert.equal(configured.slots.post_end.customHtml.includes("<img"), true);
  assert.throws(() => validateAds({ post_end_enabled: "on", post_end_provider: "custom" }), /snippet/u);
  assert.throws(() => validateAds({ publisherId: "javascript:alert(1)" }), /Publisher ID/u);
});
