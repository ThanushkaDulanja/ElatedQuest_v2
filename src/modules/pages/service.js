import { sanitizePostHtml } from "../../lib/sanitize.js";
import { withStarterPageDefaults } from "./defaults.js";

const ALLOWED_SLUGS = new Set(["about-us", "contact-us", "story-terms", "privacy-policy", "image-use-policy", "dmca-removal", "join-us", "terms"]);

export function createPagesService(repository) {
  return {
    async list() { return (await repository.list()).map(withStarterPageDefaults); },
    async get(slug) { return ALLOWED_SLUGS.has(slug) ? withStarterPageDefaults(await repository.find(slug)) : null; },
    async update(slug, input, actorId, ip) {
      if (!ALLOWED_SLUGS.has(slug)) { throw Object.assign(new Error("Page not found."), { status: 404 }); }
      const title = String(input.title ?? "").trim();
      const rawHtml = String(input.content_html ?? "");
      if (!title || title.length > 160) { throw new Error("Title is required and must be 160 characters or fewer."); }
      if (rawHtml.length > 100_000) { throw new Error("Page content must be 100,000 characters or fewer."); }
      const page = await repository.find(slug);
      if (!page) { throw Object.assign(new Error("Page not found."), { status: 404 }); }
      await repository.save(slug, title, sanitizePostHtml(rawHtml), actorId, ip);
    },
  };
}
