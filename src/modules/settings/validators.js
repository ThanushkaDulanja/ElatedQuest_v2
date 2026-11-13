import { APP_LIMITS } from "../../config/constants.js";
import { normalizeEmail } from "../../lib/email.js";
import { isValidTimeZone } from "../../lib/time.js";

function text(value, limit, label) { const result = String(value ?? "").trim(); if (Array.from(result).length > limit) {throw new Error(`${label} is too long.`);} return result; }
function email(value, label) { const result = normalizeEmail(value); if (result.length > APP_LIMITS.settingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {throw new Error(`Enter a valid ${label}.`);} return result; }

export function validateSettings(body) {
  const general = {
    siteName: text(body.siteName, APP_LIMITS.settingSiteName, "Site name"),
    tagline: text(body.tagline, APP_LIMITS.settingTagline, "Tagline"),
    contactEmail: email(body.contactEmail, "contact email"),
    submissionsEmail: email(body.submissionsEmail, "submissions email"),
    businessName: text(body.businessName, APP_LIMITS.settingBusinessName, "Business name"),
    address: text(body.address, APP_LIMITS.settingAddress, "Address"),
    timezone: validTimeZone(text(body.timezone, APP_LIMITS.settingTimezone, "Time zone")),
    footerBlurb: text(body.footerBlurb, APP_LIMITS.settingFooterBlurb, "Footer blurb"),
    socialImage: safeDestination(body.socialImage, { allowEmpty: true }),
  };
  const blocklist = String(body.blocklist ?? "").split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
  if (blocklist.some((word) => Array.from(word).length > APP_LIMITS.settingsBlocklistWord)) {throw new Error("Each blocklist word must be 80 characters or fewer.");}
  const closeAfterDays = Number(body.closeAfterDays ?? 0);
  if (!Number.isInteger(closeAfterDays) || closeAfterDays < 0 || closeAfterDays > 3650) {throw new Error("Auto-close days must be between 0 and 3650.");}
  const moderation = ["all", "first_time", "none"].includes(body.moderation) ? body.moderation : null;
  if (!moderation) {throw new Error("Choose a valid comment moderation mode.");}
  return { general, editors_can_publish: { value: body.editorsCanPublish === "on" }, blogger_auto_sync: { value: body.bloggerAutoSync === "on" }, comments: { moderation, maxDepth: 3, closeAfterDays, blocklist } };
}

function safeDestination(value, { allowEmpty = false } = {}) {
  const url = String(value ?? "").trim();
  if (!url && allowEmpty) { return ""; }
  if (url.startsWith("/") && !url.startsWith("//") && !/[\\\u0000-\u001f]/u.test(url)) { return url; }
  try { const parsed = new URL(url); if (["http:", "https:"].includes(parsed.protocol)) { return parsed.href; } } catch { /* reject invalid URL */ }
  throw new Error("Enter a valid HTTP(S) URL or site path.");
}

export function validateSocialLinks(body) {
  const items = [];
  for (let index = 0; index < 20; index += 1) {
    const platform = String(body[`platform_${index}`] ?? "").trim().toLowerCase();
    const label = String(body[`label_${index}`] ?? "").trim();
    const url = String(body[`url_${index}`] ?? "").trim();
    const followersLabel = String(body[`followers_${index}`] ?? "").trim();
    if (!platform && !label && !url && !followersLabel) { continue; }
    if (!/^[a-z0-9_-]{1,30}$/u.test(platform) || !label || label.length > 60 || followersLabel.length > 20 || url.length > 500) { throw new Error("Check each social platform, label, follower text, and URL."); }
    items.push({ platform, label, url: safeDestination(url, { allowEmpty: true }), followersLabel: followersLabel || null, showTop: body[`top_${index}`] === "on", showFooter: body[`footer_${index}`] === "on", showConnected: body[`connected_${index}`] === "on", active: body[`active_${index}`] === "on" });
  }
  return items;
}

export function validateMenuItems(body) {
  const items = [];
  for (let index = 0; index < 40; index += 1) {
    const location = String(body[`location_${index}`] ?? "").trim();
    const label = String(body[`menu_label_${index}`] ?? "").trim();
    const url = String(body[`menu_url_${index}`] ?? "").trim();
    if (!location && !label && !url) { continue; }
    if (!["top", "header", "footer"].includes(location) || !label || label.length > 80 || url.length > 500) { throw new Error("Check each menu location, label, and URL."); }
    items.push({ location, label, url: safeDestination(url), active: body[`menu_active_${index}`] === "on", newTab: body[`menu_newtab_${index}`] === "on" });
  }
  return items;
}

const AD_SLOTS = ["home_feed", "home_sidebar", "post_after_p3", "post_end", "post_sidebar"];
const MAX_AD_HTML = 5000;

export function validateAds(body) {
  const publisherId = String(body.publisherId ?? "").trim();
  if (publisherId && !/^pub-\d{16}$/u.test(publisherId)) { throw new Error("Publisher ID must use the format pub- followed by 16 digits."); }
  const slots = {};
  for (const slot of AD_SLOTS) {
    const enabled = body[`${slot}_enabled`] === "on";
    const provider = String(body[`${slot}_provider`] ?? "adsense");
    const slotId = String(body[`${slot}_slotId`] ?? "").trim();
    const customHtml = String(body[`${slot}_customHtml`] ?? "").trim();
    if (!["adsense", "custom"].includes(provider)) { throw new Error("Choose a valid ad provider."); }
    if (slotId.length > 40 || !/^[a-zA-Z0-9_-]*$/u.test(slotId)) { throw new Error("Ad slot IDs may contain letters, numbers, underscores and hyphens only."); }
    if (customHtml.length > MAX_AD_HTML) { throw new Error("Custom ad HTML must be 5,000 characters or fewer."); }
    if (enabled && provider === "adsense" && (!publisherId || !slotId)) { throw new Error("Enabled AdSense slots need a publisher ID and slot ID."); }
    if (enabled && provider === "custom" && !customHtml) { throw new Error("Enabled custom slots need an HTML snippet."); }
    slots[slot] = { enabled, provider, slotId: provider === "adsense" ? slotId : "", customHtml: provider === "custom" ? customHtml : "" };
  }
  return { enabled: body.adsEnabled === "on", publisherId, slots };
}

function validTimeZone(value) {
  if (!isValidTimeZone(value)) { throw new Error("Enter a valid time zone, such as Asia/Colombo."); }
  return value;
}
