import { env } from "../../config/env.js";
import { buildContentSecurityPolicy } from "../../config/security.js";

const SLOT_IDS = new Set(["home_feed", "home_sidebar", "post_after_p3", "post_end", "post_sidebar"]);

function safeSlot(source = {}) {
  return {
    enabled: Boolean(source.enabled),
    provider: source.provider === "custom" ? "custom" : "adsense",
    slotId: String(source.slotId ?? ""),
    customHtml: String(source.customHtml ?? ""),
  };
}

export function sanitizeAdHtml(input) {
  let html = String(input ?? "").slice(0, 5000)
    .replace(/<(script|style|iframe|object|embed|form|input|button|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|svg|math)\b[^>]*\/?\s*>/giu, "");
  const allowed = new Set(["a", "img", "div", "span", "p", "strong", "em", "br", "ins"]);
  html = html.replace(/<\/?([a-z][a-z0-9-]*)\b([^>]*)>/giu, (whole, rawName, rawAttrs) => {
    const name = rawName.toLowerCase();
    if (!allowed.has(name)) { return ""; }
    const closing = whole.startsWith("</");
    if (closing) { return ["img", "br"].includes(name) ? "" : `</${name}>`; }
    const attrs = [];
    for (const match of rawAttrs.matchAll(/([a-z][a-z0-9_-]*)\s*=\s*(["'])(.*?)\2/giu)) {
      const key = match[1].toLowerCase();
      const value = match[3].trim();
      if (key === "class" && /^[a-z0-9 _-]{1,120}$/iu.test(value)) { attrs.push(`class="${value}"`); }
      if (["alt", "title"].includes(key) && value.length <= 200) { attrs.push(`${key}="${value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`); }
      if (["width", "height"].includes(key) && /^\d{1,4}$/u.test(value)) { attrs.push(`${key}="${value}"`); }
      if (key === "href" && /^https:\/\//iu.test(value) && !/[\u0000-\u0020]/u.test(value)) { attrs.push(`href="${value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`); }
      if (key === "src" && name === "img" && /^https:\/\//iu.test(value) && !/[\u0000-\u0020]/u.test(value)) { attrs.push(`src="${value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`); }
    }
    if (name === "a") { attrs.push('rel="nofollow noopener"'); }
    if (name === "img") { attrs.push('loading="lazy"'); return `<img ${attrs.join(" ")}>`; }
    return `<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
  });
  return html;
}

export function createAdsService(settingsService) {
  async function readSettings() {
    const stored = (await settingsService.get()).ads ?? {};
    const slots = Object.fromEntries([...SLOT_IDS].map((key) => [key, safeSlot(stored.slots?.[key])]));
    return { enabled: Boolean(stored.enabled), publisherId: String(stored.publisherId ?? ""), slots };
  }
  return {
    async publicSettings(response = null, allowedSlotIds = null) {
      const settings = await readSettings();
      const slots = Object.fromEntries([...SLOT_IDS].map((key) => [key, { enabled: settings.enabled && settings.slots[key].enabled }]));
      const enabled = Object.values(slots).some((slot) => slot.enabled);
      const allowed = allowedSlotIds ? allowedSlotIds.filter((key) => SLOT_IDS.has(key)) : [...SLOT_IDS];
      const pageEnabled = allowed.some((key) => slots[key]?.enabled);
      const hasAdsense = pageEnabled && allowed.some((key) => slots[key]?.enabled && settings.slots[key].provider === "adsense");
      if (pageEnabled && response) {
        const uploadsOrigin = new URL(env.uploadsPublicUrl).origin;
        const customImageOrigins = new Set();
        for (const [key, slot] of Object.entries(settings.slots)) {
          if (!allowed.includes(key)) { continue; }
          if (!slots[key].enabled || slot.provider !== "custom") { continue; }
          for (const match of slot.customHtml.matchAll(/\bsrc\s*=\s*(["'])(https:\/\/[^"']+)\1/giu)) {
            try { customImageOrigins.add(new URL(match[2]).origin); } catch { /* Ignore malformed URLs. */ }
          }
        }
        response.setHeader("Content-Security-Policy", buildContentSecurityPolicy({ nonce: response.locals?.cspNonce, uploadsOrigin, analytics: Boolean(env.plausibleDomain), adsense: hasAdsense, customImageOrigins: [...customImageOrigins] }));
      }
      return { enabled, slots };
    },
    async slot(slotId) {
      if (!SLOT_IDS.has(String(slotId))) { return null; }
      const settings = await readSettings();
      if (!settings.enabled || !settings.slots[slotId].enabled) { return null; }
      const slot = settings.slots[slotId];
      if (slot.provider === "adsense" && (!/^pub-\d{16}$/u.test(settings.publisherId) || !slot.slotId)) { return null; }
      if (slot.provider === "custom" && !slot.customHtml) { return null; }
      return { provider: slot.provider, publisherId: settings.publisherId, slotId: slot.slotId, html: slot.provider === "custom" ? sanitizeAdHtml(slot.customHtml) : "" };
    },
    async adsTxt() {
      const settings = await readSettings();
      if (!settings.enabled || !/^pub-\d{16}$/u.test(settings.publisherId)) { return ""; }
      const hasAdsense = Object.values(settings.slots).some((slot) => slot.enabled && slot.provider === "adsense");
      return hasAdsense ? `google.com, ${settings.publisherId}, DIRECT, f08c47fec0942fa0\n` : "";
    },
  };
}
