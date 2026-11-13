import assert from "node:assert/strict";
import test from "node:test";
import { createPostsService } from "./service.js";
import { validateDraftInput, validateCategory } from "./validators.js";
import { buildUniqueSlug, slugify, validatePostSlug } from "../../lib/slug.js";
import { clear as clearCache, get as cacheGet, set as cacheSet } from "../../lib/cache.js";
import { createPostsController } from "./controller.js";

function fixture(overrides = {}) {
  const post = { id: 11, title: "Story", slug: "story", created_by: 2, author_id: 4, status: "draft", published_at: null, updated_at: new Date("2026-11-03T00:00:00Z"), tags: [], content_text: "Body" };
  const audit = [];
  const lifecycleCalls = [];
  const repository = {
    getPost: async () => ({ ...post, ...overrides.post }),
    validatePublish: async () => overrides.missing ?? [],
    setLifecycle: async (...args) => { lifecycleCalls.push(args); audit.push(`post.${args[3]}`); return { conflict: false }; },
    writeAudit: async (entry) => audit.push(entry.action),
  };
  const service = createPostsService({ repository, settingsService: { get: async () => ({ editors_can_publish: { value: overrides.enabled ?? false }, general: { timezone: overrides.timezone ?? "UTC" } }) }, emailer: { sendPostSubmittedNotice: async () => { if (overrides.mailFails) {throw new Error("mail");} } }, ownerEmail: "owner@example.test" });
  return { service, repository, post, audit, lifecycleCalls };
}

test("draft validation enforces title, slug, metadata, tag count and canonical scheme", () => {
  assert.throws(() => validateDraftInput({ title: "x".repeat(121) }), /title/u);
  assert.throws(() => validateDraftInput({ title: "x", tags: "a,b,c,d,e,f" }), /5 tags/u);
  assert.throws(() => validateDraftInput({ title: "x", canonical_url: "javascript:alert(1)" }), /http/u);
  assert.equal(validateCategory({ name: "Arts", slug: "arts", sort_order: "2", show_in_nav: "1" }).show_in_nav, 1);
  assert.deepEqual(validateCategory({ name: "Arts", slug: "arts", description: "  Culture and art  ", sort_order: "2" }), { name: "Arts", slug: "arts", description: "Culture and art", sort_order: 2, show_in_nav: 0 });
  assert.throws(() => validateCategory({ name: "Arts", slug: "arts", description: "x".repeat(301) }), /300 characters/u);
});

test("slug helper creates ASCII, unique suffixes and rejects reserved and page slugs", async () => {
  assert.equal(slugify("Crème brûlée & Café"), "creme-brulee-cafe");
  const repository = { async slugInUse(slug) { return slug === "story"; }, async pageSlugExists(slug) { return slug === "old-page"; } };
  assert.equal(await buildUniqueSlug("Story", repository), "story-2");
  await assert.rejects(validatePostSlug("login", repository), /reserved/u);
  await assert.rejects(validatePostSlug("aadmin", repository), /reserved/u);
  await assert.rejects(validatePostSlug("old-page", repository), /already in use/u);
});

test("editor submits own draft, email failure is ignored, and writes audit", async () => {
  const { service, audit } = fixture({ mailFails: true });
  await service.action(11, "submit", "", { id: 2, role: "editor" }, { ip: "127.0.0.1" }, new Date("2026-11-03T00:00:00Z"));
  assert.deepEqual(audit, ["post.submit"]);
});

test("editor cannot publish when disabled, owner can publish, validation reports missing fields", async () => {
  const { service } = fixture();
  await assert.rejects(service.action(11, "publish", "", { id: 2, role: "editor" }, {}, new Date("2026-11-03T00:00:00Z")), { status: 403 });
  const invalid = fixture({ missing: ["cover image with alt text", "category", "body"] });
  await assert.rejects(invalid.service.action(11, "publish", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z")), (error) => error.status === 409 && error.missing.includes("category"));
  const valid = fixture();
  await valid.service.action(11, "publish", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.ok(valid.audit.includes("post.publish"));
  const approved = fixture({ post: { status: "in_review" } });
  await approved.service.action(11, "publish", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.ok(approved.audit.includes("post.publish"));
  const permitted = fixture({ enabled: true });
  await permitted.service.action(11, "publish", "", { id: 2, role: "editor" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.ok(permitted.audit.includes("post.publish"));
});

test("owner can republish an edited published post while editors cannot", async () => {
  const published = fixture({ post: { status: "published", published_at: new Date("2026-11-03T00:00:00Z") } });
  const result = await published.service.action(11, "publish", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.equal(result.status, "published");
  assert.ok(published.audit.includes("post.publish"));

  const editor = fixture({ enabled: true, post: { status: "published", published_at: new Date("2026-11-03T00:00:00Z") } });
  await assert.rejects(editor.service.action(11, "publish", "", { id: 2, role: "editor" }, {}, new Date("2026-11-03T00:00:00Z")), { status: 409 });
});

test("owner schedules a draft in the configured timezone for a future instant", async () => {
  const scheduled = fixture({ timezone: "Asia/Colombo" });
  const result = await scheduled.service.action(11, "schedule", "", { id: 1, role: "owner" }, {}, "2026-11-03 00:00:00", "2026-11-04T15:00", new Date("2026-11-03T00:00:00Z"));
  assert.equal(result.status, "scheduled");
  assert.equal(scheduled.lifecycleCalls[0][7].toISOString(), "2026-11-04T09:30:00.000Z");
  await assert.rejects(scheduled.service.action(11, "schedule", "", { id: 1, role: "owner" }, {}, "2026-11-03 00:00:00", "2026-11-02T15:00", new Date("2026-11-03T00:00:00Z")), /future/u);
});

test("archiving reverts the Blogger mirror without blocking local archive", async () => {
  const archived = fixture({ post: { status: "published" } });
  let reverted = 0;
  const service = createPostsService({ repository: archived.repository, settingsService: { async get() { return {}; } }, bloggerService: { async revertPost() { reverted += 1; return { status: "failed" }; } } });
  const result = await service.action(11, "archive", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.equal(result.status, "archived");
  assert.equal(result.blogger.status, "failed");
  assert.equal(reverted, 1);
});

test("published slug edits invalidate old and new public URLs plus dependent caches", async () => {
  clearCache();
  let current = { id: 11, title: "Story", slug: "old-story", created_by: 2, author_id: 4, status: "published", published_at: new Date("2026-11-03T00:00:00Z"), updated_at: new Date("2026-11-03T00:00:00Z"), tags: [], content_text: "Body" };
  const repository = {
    async getPost() { return { ...current }; },
    async slugInUse(slug) { return slug === current.slug; },
    async pageSlugExists() { return false; },
    async savePost(_id, fields) { current = { ...current, ...fields, slug: fields.slug }; return { conflict: false }; },
    async conflictActor() { return null; },
  };
  const service = createPostsService({ repository, settingsService: { async get() { return { editors_can_publish: { value: false } }; } }, emailer: { async sendPostSubmittedNotice() {} }, ownerEmail: "owner@example.test" });
  for (const key of ["html:/old-story", "html:/new-story", "html:/?page=2", "sidebar:popular", "related:11"]) { cacheSet(key, true, 60000); }
  await service.save(11, { title: "Story", slug: "new-story", confirm_slug_change: "1", content_html: "<p>New body</p>", excerpt: "New body", tags: [], category_id: 1, seo_title: "", seo_description: "", canonical_url: "", cover_media_id: null, og_media_id: null, allow_comments: 1 }, { id: 1, role: "owner" }, { ip: "127.0.0.1" }, "2026-11-03 00:00:00");
  for (const key of ["html:/old-story", "html:/new-story", "html:/?page=2", "sidebar:popular", "related:11"]) { assert.equal(cacheGet(key), undefined, key); }
});

test("admin preview renders the public post template as noindex and uncached after authorization", async () => {
  const calls = [];
  const previewPost = { id: 12, title: "Draft story", slug: "draft-story", content_html: "<p>Draft</p>", author_id: 4, author_name: "Writer", author_slug: "writer", published_at: null, reading_minutes: 1, view_count: 0, comment_count: 0 };
  const controller = createPostsController({
    service: {
      async preview(id, user) { calls.push(["permission", id, user.id]); return { id: 12, preview_content_html: "<p>Draft</p><script>bad()</script>" }; },
      async publicContent(_id, html) { return html.replace(/<script>[\s\S]*?<\/script>/u, ""); },
    },
    repository: {},
    csrf: {},
    publicSiteService: {
      async previewData(id) { calls.push(["previewData", id]); return { post: previewPost, tags: [], related: [], sidebar: {} }; },
      async siteData() { return { general: { siteName: "Test Site", timezone: "UTC" } }; },
      safeUrl() { return null; },
    },
  });
  const headers = {};
  let rendered;
  const response = {
    set(name, value) { if (typeof name === "object") { Object.assign(headers, name); } else { headers[name.toLowerCase()] = value; } return this; },
    render(view, data) { rendered = { view, data }; return this; },
  };
  await controller.preview({ params: { id: "12" }, user: { id: 1, role: "owner" } }, response, (error) => { throw error; });
  assert.deepEqual(calls, [["permission", "12", 1], ["previewData", 12]]);
  assert.equal(rendered.view, "public/post.njk");
  assert.equal(rendered.data.previewMode, true);
  assert.equal(rendered.data.robots, "noindex,nofollow");
  assert.equal(rendered.data.canonical, null);
  assert.doesNotMatch(rendered.data.content, /bad\(\)/u);
  assert.equal(headers["Cache-Control"], "no-store");
});

test("editors can edit their own published post only when publishing permission is enabled", async () => {
  const blocked = fixture({ post: { status: "published", published_at: new Date() } });
  await assert.rejects(blocked.service.get(11, { id: 2, role: "editor" }), { status: 404 });
  const allowed = fixture({ enabled: true, post: { status: "published", published_at: new Date() } });
  assert.equal((await allowed.service.get(11, { id: 2, role: "editor" })).status, "published");
});

test("editor cannot access another editor's or in-review post; owner-only actions are denied", async () => {
  const other = fixture({ post: { created_by: 3 } });
  await assert.rejects(other.service.get(11, { id: 2, role: "editor" }), { status: 404 });
  const review = fixture({ post: { status: "in_review" } });
  await assert.rejects(review.service.get(11, { id: 2, role: "editor" }), { status: 404 });
  await assert.rejects(review.service.action(11, "reject", "", { id: 2, role: "editor" }, {}, new Date("2026-11-03T00:00:00Z")), { status: 403 });
  await assert.rejects(review.service.action(11, "archive", "", { id: 2, role: "editor" }, {}, new Date("2026-11-03T00:00:00Z")), { status: 403 });
});

test("lifecycle rejects invalid transitions and owner can reject with note then archive only published", async () => {
  const review = fixture({ post: { status: "in_review" } });
  await review.service.action(11, "reject", "Please add sources", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.ok(review.audit.includes("post.reject"));
  await assert.rejects(review.service.action(11, "submit", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z")), { status: 409 });
  await assert.rejects(review.service.action(11, "schedule", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z")), { status: 409 });
  await assert.rejects(review.service.action(11, "reject", "x".repeat(501), { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z")), /500/u);
  const published = fixture({ post: { status: "published", published_at: new Date() } });
  await published.service.action(11, "archive", "", { id: 1, role: "owner" }, {}, new Date("2026-11-03T00:00:00Z"));
  assert.ok(published.audit.includes("post.archive"));
});

test("owner can request changes, receive a resubmission, and approve the same post", async () => {
  let status = "in_review";
  const actions = [];
  const repository = {
    async getPost() { return { id: 11, title: "Story", slug: "story", created_by: 2, author_id: 4, status, published_at: null, tags: [], content_text: "Body" }; },
    async validatePublish() { return []; },
    async setLifecycle(_id, nextStatus, _actorId, action) { status = nextStatus; actions.push(action); return { conflict: false }; },
    async writeAudit(entry) { actions.push(entry.action); },
  };
  const service = createPostsService({ repository, settingsService: { get: async () => ({ editors_can_publish: { value: false } }) }, emailer: { async sendPostSubmittedNotice() {} }, ownerEmail: "owner@example.test" });
  await service.action(11, "reject", "Please add sources", { id: 1, role: "owner" }, {}, new Date());
  assert.equal(status, "draft");
  await service.action(11, "submit", "", { id: 2, role: "editor" }, {}, new Date());
  assert.equal(status, "in_review");
  await service.action(11, "publish", "", { id: 1, role: "owner" }, {}, new Date());
  assert.equal(status, "published");
  assert.ok(actions.includes("reject"));
  assert.ok(actions.includes("submit"));
  assert.ok(actions.includes("publish"));
});
