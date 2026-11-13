import { visitorHash } from "../../lib/visitor-hash.js";
import { sanitizePostHtml } from "../../lib/sanitize.js";
import { validateContact } from "./validators.js";

function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

export function createContactService({ repository, emailer, rateLimiter, contactEmail, submissionsEmail, now = Date.now }) {
  return {
    async submit(input, context) {
      if (String(input.honeypot ?? "").trim()) { return { accepted: true, silent: true }; }
      const startedAt = Number(context.startedAt ?? 0);
      if (!startedAt || now() - startedAt < 8000) { throw Object.assign(new Error("Please take a moment to review the form and try again."), { status: 400 }); }
      const hash = visitorHash(context.ip, context.userAgent);
      const data = validateContact(input);
      if (!await rateLimiter.allow(hash, data.type)) { throw Object.assign(new Error("Please wait before sending another form."), { status: 429 }); }
      if (data.type === "message") {
        const id = await repository.createMessage({ ...data, ipHash: hash });
        await emailer.sendContactMessage(contactEmail, data);
        return { accepted: true, type: "message", id };
      }
      const id = await repository.createStory({ ...data, ipHash: hash });
      await emailer.sendStorySubmission(submissionsEmail, data);
      await emailer.sendStoryReceipt(data.email, data.title);
      return { accepted: true, type: "story", id };
    },
    async stories() { return repository.listStories(); },
    async messages() { return repository.listMessages(); },
    async setStoryStatus(id, status, actorId, ip) {
      if (!["rejected", "spam"].includes(status)) { return false; }
      return repository.setStoryStatus(Number(id), status, actorId, ip);
    },
    async convertStory(id, actorId, ip) {
      const story = await repository.readStoryForConversion?.(Number(id));
      if (!story) { return null; }
      const links = String(story.links_text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
      const text = [story.body_text, links.length ? `\n\nLinks supplied:\n${links.join("\n")}` : ""].join("");
      const html = String(story.body_text).split(/\n{2,}/u).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("") + (links.length ? `<p>Links supplied:</p>${links.map((url) => `<p>${escapeHtml(url)}</p>`).join("")}` : "");
      const content = { text, html: sanitizePostHtml(html), excerpt: String(story.body_text).slice(0, 200), readingMinutes: Math.max(1, Math.ceil(text.trim().split(/\s+/u).length / 200)) };
      return repository.convertStory(Number(id), actorId, content, ip);
    },
    async setMessageStatus(id, status, actorId, ip) {
      if (!["read", "replied", "spam"].includes(status)) { return false; }
      return repository.setMessageStatus(Number(id), status, actorId, ip);
    },
  };
}
