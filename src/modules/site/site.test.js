import assert from "node:assert/strict";
import test from "node:test";
import { clear } from "../../lib/cache.js";
import { createSiteService, safePublicUrl } from "./service.js";
import { createPublicSiteRepository, isPublishedClause } from "./repository.public.js";
import { delPrefix, get as cacheGet, invalidate, set as cacheSet } from "../../lib/cache.js";
import { assertDemoDatabase, seedDemoPosts } from "./demo.js";
import { createPublicSearchLimit } from "./publicRateLimit.js";
import { publicHtmlCacheKey } from "./renderCache.js";

function repository(overrides = {}) {
  return {
    async readSiteSettings() { return { siteName: "Test Site", tagline: "A tagline", contactEmail: "hello@example.test", footerBlurb: "About us" }; },
    async readMenus() { return []; },
    async readSocialLinks() { return []; },
    async readNavigationCategories() { return []; },
    async pageBySlug() { return null; },
    async postBySlug() { return null; },
    async redirectBySlug() { return null; },
    async newestPublished() { return []; },
    async sidebarEditorPicks() { return []; }, async sidebarPopularPosts() { return []; }, async sidebarPopularCategories() { return []; },
    ...overrides,
  };
}

test("site data filters unsafe and inactive destinations, preserves order and caches until invalidated", async () => {
  clear();
  let reads = 0;
  const service = createSiteService(repository({
    async readSiteSettings() { reads += 1; return { siteName: "Test" }; },
    async readMenus(location) { return location === "top" ? [
      { label: "Safe", url: "/about-us", sort_order: 1 },
      { label: "External", url: "https://example.test", open_in_new_tab: 1 },
      { label: "Unsafe", url: "javascript:alert(1)" },
    ] : []; },
    async readSocialLinks() { return [
      { platform: "instagram", label: "Instagram", url: "https://example.test/social", show_in_top_bar: 1, show_in_footer: 1 },
      { platform: "bad", label: "Bad", url: "javascript:alert(1)", show_in_top_bar: 1, show_in_footer: 1 },
    ]; },
  }));
  const first = await service.siteData();
  await service.siteData();
  assert.equal(reads, 1);
  assert.deepEqual(first.topMenu.map((item) => item.href), ["/about-us", "https://example.test/"]);
  assert.deepEqual(first.topSocial.map((item) => item.icon), ["instagram"]);
  assert.deepEqual(first.footerSocial.map((item) => item.label), ["Instagram"]);
  service.clearSiteCache();
  await service.siteData();
  assert.equal(reads, 2);
});

test("site settings publish a safe absolute default social image for page metadata", async () => {
  clear();
  const data = repository({ async readSiteSettings() { return { siteName: "Test", socialImage: "/uploads/share-card.webp" }; } });
  const site = await createSiteService(data, { siteUrl: "https://example.test" }).siteData();
  assert.equal(site.general.socialImage, "https://example.test/uploads/share-card.webp");
  clear();
  const unsafe = repository({ async readSiteSettings() { return { socialImage: "javascript:alert(1)" }; } });
  assert.equal((await createSiteService(unsafe, { siteUrl: "https://example.test" }).siteData()).general.socialImage, "");
});

test("contact settings expose the saved business details without public seed placeholders", async () => {
  clear();
  const data = repository({ async readSiteSettings() { return { siteName: "Test", businessName: "Test Press", address: "12 Main Road\\nColombo", contactEmail: "hello@example.test" }; } });
  const general = (await createSiteService(data).siteData()).general;
  assert.equal(general.businessName, "Test Press");
  assert.equal(general.address, "12 Main Road\\nColombo");
  clear();
  const sample = repository({ async readSiteSettings() { return { address: "Street, City, Country" }; } });
  assert.equal((await createSiteService(sample).siteData()).general.address, "");
});

test("slug lookup exposes only published-rule repository results, then pages, then valid redirects", async () => {
  clear();
  const data = repository({
    async postBySlug(slug) { return slug === "live-post" ? { id: 1, slug, title: "Live", content_html: "<p>Safe</p><script>bad()</script>" } : null; },
    async pageBySlug(slug) { return slug === "about-us" ? { slug, title: "About", content_html: "<h2>About</h2><script>bad()</script>" } : null; },
    async redirectBySlug(slug) { return ({ old: "middle", middle: "live-post", cycle: "cycle" })[slug] ?? null; },
  });
  const service = createSiteService(data);
  assert.equal((await service.resolveSlug("live-post")).type, "post");
  assert.doesNotMatch((await service.resolveSlug("live-post")).post.content_html, /script/u);
  assert.equal((await service.resolveSlug("about-us")).type, "page");
  assert.doesNotMatch((await service.resolveSlug("about-us")).page.content_html, /script/u);
  assert.deepEqual(await service.resolveSlug("old"), { type: "redirect", target: "live-post" });
  assert.equal((await service.resolveSlug("cycle")).type, "not_found");
  assert.equal((await service.resolveSlug("saved")).type, "not_found");
  assert.equal((await service.resolveSlug("DRAFT")).type, "not_found");
});

test("public URLs allow safe HTTP(S) and internal paths only", () => {
  assert.equal(safePublicUrl("https://example.test/a"), "https://example.test/a");
  assert.equal(safePublicUrl("/contact-us", true), "/contact-us");
  assert.equal(safePublicUrl("//evil.test", true), null);
  assert.equal(safePublicUrl("javascript:alert(1)"), null);
});

test("shared published clause excludes unpublished, future and deleted posts", () => {
  assert.match(isPublishedClause, /status = 'published'/u);
  assert.match(isPublishedClause, /published_at <= UTC_TIMESTAMP\(\)/u);
  assert.match(isPublishedClause, /deleted_at IS NULL/u);
});

test("public post lookup binds the slug and applies the shared visibility rule", async () => {
  let call;
  const publicRepository = createPublicSiteRepository({ async execute(sql, values) { call = { sql, values }; return [[]]; } });
  assert.equal(await publicRepository.postBySlug("draft-hidden"), null);
  assert.equal(call.values[0], "draft-hidden");
  assert.match(call.sql, /status = 'published'/u);
  assert.match(call.sql, /published_at <= UTC_TIMESTAMP\(\)/u);
  assert.match(call.sql, /deleted_at IS NULL/u);
});

test("people-also-read repository filters published category posts and binds the candidate limit", async () => {
  let call;
  const publicRepository = createPublicSiteRepository({ async execute(sql, values) { call = { sql, values }; return [[]]; } });
  await publicRepository.alsoReadingCandidates("travel", 12);
  assert.match(call.sql, /status = 'published'/u);
  assert.match(call.sql, /category_id = \(SELECT id FROM categories WHERE slug = \?/u);
  assert.deepEqual(call.values, ["travel", "travel", 12]);
});

test("popular stories bind a seven or thirty day date window", async () => {
  const calls = [];
  const publicRepository = createPublicSiteRepository({ async execute(sql, values) { calls.push({ sql, values }); return [[]]; } });
  await publicRepository.sidebarPopularPosts(5, 7);
  await publicRepository.sidebarPopularPosts(5, 30);
  assert.match(calls[0].sql, /INTERVAL \? DAY/u);
  assert.deepEqual(calls.map((call) => call.values), [[6, 5], [29, 5]]);
});

test("site service returns recommendations, saved published posts and a random published slug", async () => {
  clear();
  const calls = [];
  const service = createSiteService(repository({
    async alsoReadingCandidates(category, limit) { calls.push([category, limit]); return [{ id: 2, slug: "read-next", excerpt: "Short saved excerpt", content_text: "Short saved excerptThe article body starts here with the opening paragraphs.", cover_url: null }]; },
    async postsByIds(ids) { calls.push(ids); return [{ id: 4, slug: "saved-story", cover_url: null }]; },
    async randomPublished() { return "surprise-story"; },
  }));
  const recommended = (await service.alsoReading("travel"))[0];
  assert.equal(recommended.slug, "read-next");
  assert.equal(recommended.excerpt, "The article body starts here with the opening paragraphs.");
  assert.deepEqual(calls[0], ["travel", 12]);
  assert.equal((await service.savedPosts([4, "bad", 4, 9]))[0].slug, "saved-story");
  assert.deepEqual(calls[1], [4, 9]);
  assert.equal(await service.randomPost(), "surprise-story");
});

test("cache prefix deletion and 500-entry cap preserve the existing cache API", () => {
  clear();
  cacheSet("site:one", 1, Infinity);
  cacheSet("page:one", 2, Infinity);
  assert.equal(delPrefix("site:"), 1);
  assert.equal(cacheGet("site:one"), undefined);
  assert.equal(cacheGet("page:one"), 2);
  clear();
  for (let index = 0; index < 501; index += 1) { cacheSet(`key:${index}`, index, Infinity); }
  assert.equal(cacheGet("key:0"), undefined);
  assert.equal(cacheGet("key:500"), 500);
  cacheSet("site:data", true, Infinity);
  cacheSet("post:demo", true, Infinity);
  invalidate("site:");
  invalidate("post:demo");
  assert.equal(cacheGet("site:data"), undefined);
  assert.equal(cacheGet("post:demo"), undefined);
  clear();
});

test("demo scripts refuse production and test databases and seed 14 dated posts", async () => {
  assert.throws(() => assertDemoDatabase({ nodeEnv: "production", databaseName: "elatedquest", testDatabaseName: "elatedquest_m0_test" }), /disabled in production/u);
  assert.throws(() => assertDemoDatabase({ nodeEnv: "development", databaseName: "elatedquest_m0_test", testDatabaseName: "elatedquest_m0_test" }), /cannot run against DB_TEST_NAME/u);
  assert.throws(() => assertDemoDatabase({ nodeEnv: "development", databaseName: "other", testDatabaseName: "elatedquest_m0_test" }), /require the development database/u);
  assert.doesNotThrow(() => assertDemoDatabase({ nodeEnv: "development", databaseName: "elatedquest", testDatabaseName: "elatedquest_m0_test" }));
  const posts = [];
  const categories = [];
  const authors = [];
  const tags = [];
  const saved = await seedDemoPosts({
    async saveCategory(...args) { categories.push(args); return categories.length; },
    async saveAuthor(...args) { authors.push(args); return authors.length; },
    async saveTag(...args) { tags.push(args); return tags.length; },
    async savePost(post) { posts.push(post); },
  }, new Date("2026-11-05T00:00:00Z"));
  assert.equal(saved, 14);
  assert.equal(categories.length, 4);
  assert.equal(authors.length, 2);
  assert.equal(authors[1][2], true);
  assert.equal(tags.length, 5);
  assert.equal(posts.length, 14);
  assert.ok(posts.every((post) => post.slug.startsWith("demo-") && post.publishedAt && post.tagIds.length >= 3 && post.tagIds.length <= 5));
  assert.ok(posts.some((post) => post.featured));
  assert.ok(posts.some((post) => post.editorPick));
  const days = posts.map((post) => new Date(`${post.publishedAt.replace(" ", "T")}Z`).getTime());
  assert.ok(Math.max(...days) - Math.min(...days) > 50 * 24 * 60 * 60 * 1000);
});

test("home content keeps the featured group out of every latest page and paginates after it", async () => {
  clear();
  const calls = [];
  const service = createSiteService(repository({
    async homeFeatured() { return { featured: { id: 1, slug: "feature" }, companions: [{ id: 2, slug: "companion-1" }, { id: 3, slug: "companion-2" }] }; },
    async countPublishedAll() { return 24; },
    async homeLatest(options) { calls.push(options); return [{ id: 4, slug: "latest" }]; },
    async sidebarEditorPicks() { return []; }, async sidebarPopularPosts() { return []; }, async sidebarPopularCategories() { return []; },
  }));
  const first = await service.homeData(1);
  const second = await service.homeData(2);
  assert.equal(first.featured.slug, "feature");
  assert.equal(first.companions.length, 2);
  assert.equal(second.featured, null);
  assert.deepEqual(calls[0].featuredIds, [1, 2, 3]);
  assert.deepEqual(calls[1].featuredIds, [1, 2, 3]);
  assert.equal(calls[1].offset, 10);
  assert.equal(first.pageCount, 3);
});

test("People Also Read fills 18 slots with published candidates and repeats only when needed", async () => {
  clear();
  const posts = [1, 2, 3, 4].map((id) => ({ id, slug: `story-${id}`, title: `Story ${id}`, excerpt: "Tiny excerpt", content_text: "Tiny excerptThe opening body text readers should see." }));
  const service = createSiteService(repository({
    async homeFeatured() { return { featured: null, companions: [] }; },
    async countPublishedAll() { return 20; },
    async homeLatest() { return []; },
    async alsoReadingCandidates() { return posts; },
    async sidebarEditorPicks() { return []; }, async sidebarPopularPosts() { return []; }, async sidebarPopularCategories() { return []; },
  }));
  const result = await service.homeData(1);
  assert.equal(result.alsoReadingCandidates.length, 18);
  assert.equal(result.alsoReadingCandidates[0].excerpt, "The opening body text readers should see.");
  assert.deepEqual(result.alsoReadingCandidates.slice(0, 4).map((post) => post.id), [1, 2, 3, 4]);
  assert.deepEqual(result.alsoReadingCandidates.slice(4).map((post) => post.id), [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4]);
});

test("archive counts use published rows, tag noindex starts below three, and empty authors are hidden", async () => {
  clear();
  const service = createSiteService(repository({
    async tagBySlug(slug) { return slug === "few" ? { id: 4, name: "Few", slug } : null; },
    async countTag() { return 2; }, async tagPosts() { return [{ id: 1, slug: "one" }]; },
    async authorBySlug() { return { id: 9, name: "Guest Writer", slug: "guest", avatar_url: null }; },
    async countAuthor() { return 0; },
  }));
  const tag = await service.archive("tag", "few", 1);
  assert.equal(tag.count, 2);
  assert.equal(tag.noindex, true);
  assert.equal(await service.archive("author", "guest", 1), null);
  assert.equal(await service.archive("tag", "few", 2), null);
});

test("search uses the escaped two-character fallback, safe highlighting, and page limits", async () => {
  clear();
  const calls = [];
  const service = createSiteService(repository({
    async countSearch(query, fallback) { calls.push({ query, fallback }); return fallback ? 1 : 0; },
    async searchTitleFallback(pattern) { calls.push({ pattern }); return [{ id: 5, slug: "search-result", title: "<script>sample</script>", content_text: "A sample text containing <script>payload</script>" }]; },
  }));
  const result = await service.search("a%", "abc");
  assert.equal(result.page, 1);
  assert.equal(result.results.length, 1);
  assert.equal(calls[0].query, "%a\\%%");
  assert.equal(calls[0].fallback, true);
  assert.doesNotMatch(result.results[0].titleHtml, /<script>/u);
  assert.match(result.results[0].titleHtml, /&lt;script&gt;/u);
  assert.doesNotMatch(result.results[0].snippetHtml, /<script>/u);
  assert.equal(await service.search("x", 1).then((value) => value.valid), false);
});

test("public search limiter allows thirty requests in its rolling minute", () => {
  let clock = 1000;
  const limit = createPublicSearchLimit({ now: () => clock });
  let status = 0;
  let nextCount = 0;
  const response = { set() {}, status(value) { status = value; return this; }, send() { return this; } };
  const request = { ip: "192.0.2.1" };
  for (let index = 0; index < 30; index += 1) { limit(request, response, () => { nextCount += 1; }); }
  limit(request, response, () => { nextCount += 1; });
  assert.equal(nextCount, 30);
  assert.equal(status, 429);
  clock += 60_001;
  limit(request, response, () => { nextCount += 1; });
  assert.equal(nextCount, 31);
});

test("public view service ignores bots and only delegates positive numeric post IDs", async () => {
  const ids = [];
  const service = createSiteService(repository({ async incrementPublishedView(id) { ids.push(id); return id === 5; } }));
  assert.deepEqual(await service.recordView(5, "Mozilla/5.0"), { counted: true, ignored: false });
  assert.deepEqual(await service.recordView(6, "GoogleBot crawler"), { counted: false, ignored: true });
  assert.deepEqual(await service.recordView("invalid", "Mozilla/5.0"), { counted: false, ignored: false });
  assert.deepEqual(ids, [5]);
});

test("M4 invalidation clears rendered pages and dependent site, sidebar and related data", () => {
  clear();
  cacheSet("html:/", "home", 60000);
  cacheSet("html:/post?x=1", "post", 60000);
  cacheSet("sidebar:popular", [], 60000);
  cacheSet("related:5", [], 60000);
  cacheSet("site:data", {}, Infinity);
  invalidate("home");
  assert.equal(cacheGet("html:/"), undefined);
  assert.equal(cacheGet("html:/post?x=1"), undefined);
  assert.equal(cacheGet("sidebar:popular"), undefined);
  assert.equal(cacheGet("related:5"), undefined);
  cacheSet("html:/category/nature", "category", 60000);
  cacheSet("site:data", {}, Infinity);
  invalidate("site:");
  assert.equal(cacheGet("html:/category/nature"), undefined);
  assert.equal(cacheGet("site:data"), undefined);
});

test("public rendered cache keys sort query parameters and preserve repeated values", () => {
  assert.equal(publicHtmlCacheKey({ path: "/category/nature", query: { z: "last", a: ["one", "two"], b: "middle" } }), "html:/category/nature?a=one&a=two&b=middle&z=last");
});

test("published view repository updates daily and total counters in one transaction", async () => {
  const calls = [];
  let committed = false;
  const connection = {
    async beginTransaction() { calls.push("begin"); },
    async execute(sql, values) { calls.push({ sql, values }); return [/^SELECT/u.test(sql) ? [{ id: 12 }] : {}]; },
    async commit() { committed = true; },
    async rollback() { assert.fail("published view should commit"); },
    release() { calls.push("release"); },
  };
  const siteRepository = createPublicSiteRepository({ async getConnection() { return connection; } });
  assert.equal(await siteRepository.incrementPublishedView(12), true);
  assert.equal(committed, true);
  const statements = calls.filter((entry) => typeof entry === "object");
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /status = 'published'.*published_at <= UTC_TIMESTAMP\(\).*deleted_at IS NULL/u);
  assert.match(statements[1].sql, /post_daily_views/u);
  assert.match(statements[2].sql, /view_count = view_count \+ 1/u);
  assert.deepEqual(statements.map((entry) => entry.values[0]), [12, 12, 12]);
});

test("unpublished view repository check rolls back without changing either counter", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {},
    async execute(sql) { calls.push(sql); return [[]]; },
    async commit() { assert.fail("unpublished post cannot be counted"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  };
  const siteRepository = createPublicSiteRepository({ async getConnection() { return connection; } });
  assert.equal(await siteRepository.incrementPublishedView(88), false);
  assert.equal(calls.filter((sql) => typeof sql === "string" && (sql.startsWith("INSERT") || sql.startsWith("UPDATE"))).length, 0);
  assert.ok(calls.includes("rollback"));
  assert.ok(calls.includes("release"));
});

test("archive card query returns author, category and media in one joined SQL call", async () => {
  const calls = [];
  const siteRepository = createPublicSiteRepository({ async execute(sql, values) { calls.push({ sql, values }); return [[]]; } });
  await siteRepository.categoryPosts(8, 12, 12);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /LEFT JOIN categories/u);
  assert.match(calls[0].sql, /LEFT JOIN authors/u);
  assert.match(calls[0].sql, /LEFT JOIN media am/u);
  assert.match(calls[0].sql, /LEFT JOIN media m/u);
  assert.match(calls[0].sql, /LIMIT \? OFFSET \?/u);
  assert.deepEqual(calls[0].values, [8, 12, 12]);
});

test("post pages score related published candidates and cache four results by post id", async () => {
  clear();
  let relatedReads = 0;
  const current = { id: 41, slug: "current", title: "Current", category_id: 8, author_name: "Writer", author_slug: "writer", published_at: new Date().toISOString() };
  const candidates = Array.from({ length: 5 }, (_value, index) => ({ id: 50 + index, slug: `related-${index}`, category_id: index === 0 ? 8 : 9, shared_tag_count: index, published_at: new Date().toISOString() }));
  const service = createSiteService(repository({
    async postDetailBySlug() { return current; },
    async postTags() { return [{ id: 1, slug: "nature", name: "Nature" }]; },
    async relatedCandidates() { relatedReads += 1; return candidates; },
    async newestPublished() { return [current]; },
  }), { random: () => 0 });
  const first = await service.postPage("current");
  const second = await service.postPage("current");
  assert.equal(first.related.length, 4);
  assert.ok(first.related.every((post) => post.id !== current.id));
  assert.equal(first.related[0].slug, "related-3");
  assert.deepEqual(second.related.map((post) => post.id), first.related.map((post) => post.id));
  assert.equal(relatedReads, 1);
});
