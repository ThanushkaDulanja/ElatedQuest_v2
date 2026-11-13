import assert from "node:assert/strict";
import test from "node:test";
import { breadcrumbSchema, safeJsonLd, sitemapXml, rssXml } from "./metadata.js";
import { createSeoRepository } from "./repository.js";
import { createSeoController } from "./controller.js";

test("SEO serializers escape markup and emit JSON-LD safely", () => {
  const xml = sitemapXml([{ url: "https://example.test/a&b", updatedAt: "2026-11-09T00:00:00Z" }]);
  assert.match(xml, /a&amp;b/u);
  assert.match(xml, /<lastmod>2026-11-09<\/lastmod>/u);
  const rss = rssXml({ siteName: "A&B", siteUrl: "https://example.test", posts: [{ title: "<Story>", slug: "story", excerpt: "A & B", published_at: "2026-11-09T00:00:00Z" }] });
  assert.match(rss, /&lt;Story&gt;/u);
  assert.match(rss, /A &amp; B/u);
  assert.doesNotMatch(safeJsonLd(breadcrumbSchema([{ name: "</script><script>", url: "https://example.test" }])), /<\//u);
});

test("sitemap and feed queries exclude unpublished posts and unindexable tags", async () => {
  const queries = [];
  const database = { async execute(sql, params) { queries.push({ sql, params }); return [[]]; } };
  const repository = createSeoRepository(database);
  await repository.sitemapEntries();
  await repository.feedPosts();
  const postQueries = queries.filter(({ sql }) => /FROM posts/u.test(sql));
  assert.equal(postQueries.length, 2);
  for (const { sql } of postQueries) {
    assert.match(sql, /status = 'published'/u);
    assert.match(sql, /published_at <= UTC_TIMESTAMP\(\)/u);
    assert.match(sql, /deleted_at IS NULL/u);
  }
  assert.match(queries.find(({ sql }) => /FROM tags/u.test(sql)).sql, /HAVING COUNT\(DISTINCT p\.id\) >= 3/u);
});

test("robots points to the canonical sitemap and crawler feeds render with XML types", async () => {
  const controller = createSeoController({
    async sitemapEntries() { return [{ path: "/post", updatedAt: "2026-11-09T00:00:00Z" }]; },
    async feedPosts() { return [{ title: "Story", slug: "story", excerpt: "Text", published_at: "2026-11-09T00:00:00Z" }]; },
    async siteSettings() { return { siteName: "Site" }; },
  }, { siteUrl: "https://example.test", plausibleDomain: "example.test" });
  const response = {
    headers: {}, type(value) { this.contentType = value; return this; }, set(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
  };
  await controller.robots({}, response);
  assert.match(response.body, /Disallow: \/aadmin\nDisallow: \/api/u);
  assert.match(response.body, /Sitemap: https:\/\/example\.test\/sitemap\.xml/u);
  await controller.sitemap({}, response, (error) => { throw error; });
  assert.match(response.body, /https:\/\/example\.test\/post/u);
  await controller.feed({}, response, (error) => { throw error; });
  assert.match(response.body, /<title>Site<\/title>/u);
  assert.match(response.body, /https:\/\/example\.test\/story/u);
});
