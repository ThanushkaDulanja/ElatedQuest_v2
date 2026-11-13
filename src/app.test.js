import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { clear as clearPublicCache, get as getPublicCache } from "./lib/cache.js";

process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3000";
process.env.SITE_URL ??= "http://localhost:3000";
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "test_user";
process.env.DB_PASSWORD ??= "test_password";
process.env.DB_NAME ??= "elatedquest_m0_test";
process.env.SESSION_SECRET ??= "test_session_secret";
process.env.HASH_SECRET ??= "test_hash_secret";
process.env.OWNER_EMAIL ??= "owner@example.test";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_USER ??= "test-smtp-user";
process.env.SMTP_PASS ??= "test-smtp-pass";
process.env.EMAIL_FROM ??= "ElatedQuest <noreply@example.test>";
process.env.SUBMISSIONS_EMAIL ??= "stories@example.test";
process.env.CONTACT_EMAIL ??= "contact@example.test";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString("base64");
process.env.UPLOAD_DIR ??= "./uploads";
process.env.UPLOADS_PUBLIC_URL ??= "http://localhost:3000/uploads";

const { createApp } = await import("./app.js");
const { sanitizePostHtml } = await import("./lib/sanitize.js");

function emptyPublicSiteRepository() {
  return {
    async readSiteSettings() { return { siteName: "Test Site", tagline: "", contactEmail: "", footerBlurb: "" }; },
    async readMenus() { return []; }, async readSocialLinks() { return []; }, async readNavigationCategories() { return []; },
    async pageBySlug() { return null; }, async postBySlug() { return null; }, async redirectBySlug() { return null; }, async newestPublished() { return []; },
    async homeFeatured() { return { featured: null, companions: [] }; }, async countPublishedAll() { return 0; }, async homeLatest() { return []; },
    async sidebarEditorPicks() { return []; }, async sidebarPopularPosts() { return []; }, async sidebarPopularCategories() { return []; },
    async categoryBySlug() { return null; }, async tagBySlug() { return null; }, async authorBySlug() { return null; },
    async countCategory() { return 0; }, async countTag() { return 0; }, async countAuthor() { return 0; },
    async categoryPosts() { return []; }, async tagPosts() { return []; }, async authorPosts() { return []; },
    async postDetailBySlug() { return null; }, async postTags() { return []; }, async relatedCandidates() { return []; },
    async countSearch() { return 0; }, async searchPosts() { return []; }, async searchTitleFallback() { return []; },
    async incrementPublishedView() { return true; },
  };
}

test("health endpoint returns 200 and queries its database dependency", async (context) => {
  let checked = false;
  const app = createApp({
    health: {
      repository: {
        async checkDatabase() {
          checked = true;
        },
      },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(checked, true);
});

test("A1 renders a CSRF token and rejects email-link submissions without it", async (context) => {
  const app = createApp({
    sessionMiddleware(request, _response, next) {
      request.session = { id: "session-for-csrf-test" };
      next();
    },
    auth: {
      ownerEmail: "owner@example.test",
      repository: {
        async findUserById() {
          return null;
        },
        async incrementRateLimit() {
          return { allowed: true };
        },
      },
      service: {
        async requestEmailLink() {
          return { limited: false };
        },
        async audit() {},
      },
      oauthClient: {},
      emailer: {},
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${baseUrl}/aadmin/login`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const html = await page.text();
  const token = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const cookie = page.headers
    .get("set-cookie")
    ?.match(/elatedquest\.csrf=[^;]+/)?.[0];
  assert.ok(token);
  assert.ok(cookie);
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /name="password"|type="password"|forgot password|registration/i);

  const rejected = await fetch(`${baseUrl}/auth/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: "email=invite%40example.test",
  });
  assert.equal(rejected.status, 403);

  const accepted = await fetch(`${baseUrl}/auth/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: new URLSearchParams({ email: "invite@example.test", _csrf: token }),
  });
  assert.equal(accepted.status, 200);
  assert.match(
    await accepted.text(),
    /If this email is invited, a sign-in link is on its way/,
  );
});

test("editor receives 403 on Team, Settings, Static pages and Audit pages", async (context) => {
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "editor-session", userId: 22 }; next(); },
    auth: {
      ownerEmail: "owner@example.test",
      repository: { async findUserById() { return { id: 22, email: "editor@example.test", role: "editor", status: "active" }; } },
      service: { async audit() {}, async requestEmailLink() { return { limited: false }; } },
      oauthClient: {}, emailer: { async sendInviteNotice() {} },
    },
    site: { repository: emptyPublicSiteRepository() },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/aadmin/team", "/aadmin/settings", "/aadmin/pages", "/aadmin/pages/privacy-policy", "/aadmin/audit"]) {
    const response = await fetch(`${base}${route}`, { redirect: "manual" });
    assert.equal(response.status, 403, route);
    assert.match(await response.text(), /Access denied/);
  }
  for (const route of ["/api/admin/team", "/api/admin/settings", "/aadmin/pages/privacy-policy", "/api/admin/blogger/retry-failed", "/api/admin/team/1/disable", "/api/admin/authors/guest"]) {
    assert.equal((await fetch(`${base}${route}`, { method: "POST", redirect: "manual" })).status, 403, route);
  }
  const missing = await fetch(`${base}/not-a-real-page`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Page not found/);
});

test("owner can list and edit seeded static pages with the rich text editor", async (context) => {
  const rows = [{ id: 1, slug: "privacy-policy", title: "Privacy Policy", content_html: "<p>Seed policy</p>", updated_at: new Date("2026-11-09T00:00:00Z") }];
  const database = { async execute(sql) { return [sql.startsWith("SELECT id, slug, title, updated_at") ? rows : rows]; } };
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "owner-pages-session", userId: 1 }; next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return { id: 1, email: "owner@example.test", display_name: "Owner", role: "owner", status: "active" }; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: emptyPublicSiteRepository(), database },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const listing = await fetch(`${base}/aadmin/pages`);
  assert.equal(listing.status, 200);
  assert.match(await listing.text(), /Privacy Policy/u);
  const editor = await fetch(`${base}/aadmin/pages/privacy-policy`);
  assert.equal(editor.status, 200);
  const html = await editor.text();
  assert.match(html, /Seed policy/u);
  assert.match(html, /data-page-quill/u);
  assert.match(html, /\/vendor\/quill\/quill\.js/u);
  assert.match(html, /name="_csrf"/u);
});

test("public home and not-found responses set no cookies", async (context) => {
  clearPublicCache();
  const app = createApp({
    sessionMiddleware(_request, _response, next) { next(); },
    auth: {
      ownerEmail: "owner@example.test",
      repository: { async findUserById() { return null; }, async incrementRateLimit() { return { allowed: true }; } },
      service: { async audit() {}, async requestEmailLink() { return { limited: false }; } },
      oauthClient: {}, emailer: {},
    },
    site: { repository: emptyPublicSiteRepository() },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("set-cookie"), null);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.ok(home.headers.get("strict-transport-security"));
  assert.equal(home.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=()");
  assert.match(home.headers.get("content-security-policy"), /nonce-[A-Za-z0-9+/=]+/u);
  const missing = await fetch(`${base}/not-a-real-page`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("set-cookie"), null);
});

test("public slug routing canonicalizes paths, sanitizes static pages and collapses redirects", async (context) => {
  const siteRepository = {
    ...emptyPublicSiteRepository(),
    async pageBySlug(slug) { return slug === "about-us" ? { slug, title: "About us", content_html: "<p>Safe page</p><script>bad()</script>" } : null; },
    async postBySlug(slug) { return slug === "go-live" ? { id: 4, slug, title: "Published story", content_html: "<p>Published body</p><script>bad()</script>" } : null; },
    async postDetailBySlug(slug) { return slug === "go-live" ? { id: 4, slug, title: "Published story", content_html: "<p>Published body</p><script>bad()</script>", author_name: "Writer", author_slug: "writer", reading_minutes: 1, published_at: new Date().toISOString(), view_count: 0, comment_count: 0 } : null; },
    async redirectBySlug(slug) { return ({ "old-one": "old-two", "old-two": "go-live", "old-hidden": "hidden-post" })[slug] ?? null; },
  };
  const app = createApp({
    sessionMiddleware(_request, _response, next) { next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return null; }, async incrementRateLimit() { return { allowed: true }; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: siteRepository, authorsService: { async publicTeam() { return []; } }, commentsService: { async list() { return []; } }, postsService: { async publicContent(_id, html) { return sanitizePostHtml(html); } } },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const canonical = await fetch(`${base}/ABOUT-US/`, { redirect: "manual" });
  assert.equal(canonical.status, 301);
  assert.equal(canonical.headers.get("location"), "/about-us");
  const page = await fetch(`${base}/about-us`);
  assert.equal(page.status, 200);
  const pageBody = await page.text();
  assert.match(pageBody, /Safe page/u);
  assert.match(pageBody, /property="og:title" content="About us – Test Site"/u);
  assert.match(pageBody, /name="twitter:card"/u);
  assert.doesNotMatch(pageBody, /bad\(\)/u);
  const old = await fetch(`${base}/old-one`, { redirect: "manual" });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get("location"), "/go-live");
  const hidden = await fetch(`${base}/old-hidden`, { redirect: "manual" });
  assert.equal(hidden.status, 404);
  const post = await fetch(`${base}/go-live`);
  assert.equal(post.status, 200);
  assert.doesNotMatch(await post.text(), /bad\(\)/u);
  const saved = await fetch(`${base}/saved`);
  assert.equal(saved.status, 200);
  assert.match(await saved.text(), /Saved stories/u);
});

test("M4 content routes render home, archives, author, search and a full post page", async (context) => {
  clearPublicCache();
  const published = { id: 7, title: "Demo Nature Notes", slug: "demo-nature-notes", excerpt: "A short excerpt", content_html: "<p>Safe body</p>", content_text: "Safe body about nature", published_at: new Date().toISOString(), reading_minutes: 2, view_count: 3, comment_count: 1, category_id: 1, category_name: "Outdoors", category_slug: "outdoors", author_name: "Demo Writer", author_slug: "demo-writer", author_bio: "Writes about nature", author_avatar_url: null, cover_url: null, cover_alt: "", cover_width: null, cover_height: null, is_featured: 1, is_editor_pick: 0, seo_description: "Search metadata" };
  const siteRepository = {
    ...emptyPublicSiteRepository(),
    async homeFeatured() { return { featured: published, companions: [] }; },
    async countPublishedAll() { return 1; }, async homeLatest() { return []; },
    async sidebarEditorPicks() { return []; }, async sidebarPopularPosts() { return []; }, async sidebarPopularCategories() { return []; },
    async categoryBySlug(slug) { return { id: 1, slug, name: "Outdoors", description: "Outside" }; },
    async tagBySlug(slug) { return { id: 2, slug, name: "Nature" }; },
    async authorBySlug(slug) { return { id: 3, slug, name: "Demo Writer", bio: "Writes about nature" }; },
    async countCategory() { return 1; }, async countTag() { return 3; }, async countAuthor() { return 1; },
    async categoryPosts() { return [published]; }, async tagPosts() { return [published]; }, async authorPosts() { return [published]; },
    async postBySlug(slug) { return slug === published.slug ? published : null; },
    async postDetailBySlug(slug) { return slug === published.slug ? published : null; },
    async postTags() { return [{ id: 2, slug: "nature", name: "Nature" }]; }, async relatedCandidates() { return []; },
    async newestPublished() { return [published]; },
    async countSearch() { return 1; }, async searchPosts() { return [published]; }, async searchTitleFallback() { return [published]; },
  };
  const app = createApp({
    sessionMiddleware(_request, _response, next) { next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return null; }, async incrementRateLimit() { return { allowed: true }; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: siteRepository, commentsService: { async list() { return [{ id: 1, parent_id: null, author_name: "Reader", author_initials: "R", body: "<script>alert(1)</script>", is_staff: 0, vote_score: 0, created_at: new Date() }]; } }, postsService: { async publicContent(_id, html) { return sanitizePostHtml(html); } } },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const pathname of ["/", "/category/outdoors", "/tag/nature", "/author/demo-writer", "/search?q=nature", "/demo-nature-notes"]) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type"), /text\/html/u, pathname);
    const body = await response.text();
    assert.match(body, /Demo Nature Notes|Search stories|Outdoors|Demo Writer/u, pathname);
    assert.equal((body.match(/<h1\b/gu) ?? []).length, 1, pathname);
    if (pathname === "/") {
      assert.match(body, /property="og:type" content="website"/u);
      assert.match(body, /application\/ld\+json/u);
      assert.match(body, /<div class="public-home-frame">[\s\S]*<div class="public-home-top">[\s\S]*public-home-featured__leads/u);
      assert.match(body, /<aside class="public-sidebar"/u);
      assert.match(body, /<section class="public-home-latest"[\s\S]*Latest articles/u);
      assert.doesNotMatch(body, /People also read|Stay connected|Load more|cookie-consent|ad-slot/u);
    }
    if (pathname === "/demo-nature-notes") {
      assert.match(body, /property="og:type" content="article"/u);
      assert.match(body, /"@type":"Article"/u);
      assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
      assert.doesNotMatch(body, /<script>alert\(1\)<\/script>/u);
    }
  }
  const api = await fetch(`${base}/api/search?q=nature`);
  assert.equal(api.status, 200);
  assert.equal((await api.json()).results[0].slug, published.slug);
});

test("M8 slots render only in allowed positions and slot configuration requires consent", async (context) => {
  clearPublicCache();
  const latest = Array.from({ length: 10 }, (_, index) => ({ id: index + 10, title: `Feed story ${index + 1}`, slug: `feed-story-${index + 1}`, excerpt: "Excerpt", content_html: "<p>Body</p>", content_text: "Body", published_at: new Date().toISOString(), reading_minutes: 1, view_count: 0, comment_count: 0, category_id: 1, category_name: "Outdoors", category_slug: "outdoors", author_name: "Writer", author_slug: "writer", cover_url: null, cover_alt: "", cover_width: null, cover_height: null }));
  const longPost = { ...latest[0], id: 2, title: "Long post", slug: "long-post", content_html: Array.from({ length: 6 }, (_, index) => `<p>Paragraph ${index + 1}</p>`).join(""), content_text: "Long article paragraphs", is_featured: 1, seo_description: "Long post" };
  const shortPost = { ...longPost, id: 3, slug: "short-post", content_html: "<p>First</p><p>Second</p><p>Third</p>", content_text: "Short article" };
  const siteRepository = {
    ...emptyPublicSiteRepository(),
    async homeFeatured() { return { featured: latest[0], companions: [] }; },
    async countPublishedAll() { return 11; }, async homeLatest() { return latest; },
    async categoryBySlug(slug) { return { id: 1, slug, name: "Outdoors", description: "Outside" }; },
    async pageBySlug(slug) { return slug === "privacy-policy" ? { slug, title: "Privacy policy", content_html: "<p>Policy text</p>" } : null; },
    async countCategory() { return 10; }, async categoryPosts() { return latest; },
    async postBySlug(slug) { return [longPost, shortPost].find((post) => post.slug === slug) ?? null; },
    async postDetailBySlug(slug) { return [longPost, shortPost].find((post) => post.slug === slug) ?? null; },
    async newestPublished() { return latest.slice(0, 6); },
  };
  const adSettings = { enabled: true, slots: { home_feed: { enabled: true }, post_after_p3: { enabled: true }, post_end: { enabled: true }, post_sidebar: { enabled: true } } };
  const adsService = {
    async publicSettings() { return adSettings; },
    async slot(slot) { return { provider: "custom", html: `<p>${slot}</p>` }; },
    async adsTxt() { return "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n"; },
  };
  const app = createApp({
    sessionMiddleware(_request, _response, next) { next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return null; }, async incrementRateLimit() { return { allowed: true }; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: siteRepository, commentsService: { async list() { return []; }, async canComment() { return true; } }, postsService: { async publicContent(_id, html) { return sanitizePostHtml(html); } } },
    ads: { service: adsService },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const home = await (await fetch(base)).text();
  assert.equal((home.match(/data-ad-slot="home_feed"/gu) ?? []).length, 1);
  assert.match(home, /data-ad-slot="home_feed"[^>]* hidden/u);
  assert.doesNotMatch(home, /pagead2\.googlesyndication|pub-1234567890123456|googleads\.g\.doubleclick/u);
  assert.match(home, /data-feature="ads-consent"/u);
  const category = await (await fetch(`${base}/category/outdoors`)).text();
  assert.equal((category.match(/data-ad-slot="home_feed"/gu) ?? []).length, 1);
  const post = await (await fetch(`${base}/long-post`)).text();
  assert.equal((post.match(/data-ad-slot="post_after_p3"/gu) ?? []).length, 1);
  assert.equal((post.match(/data-ad-slot="post_end"/gu) ?? []).length, 1);
  assert.equal((post.match(/data-ad-slot="post_sidebar"/gu) ?? []).length, 1);
  assert.match(post, /Paragraph 3<\/p>[\s\S]*data-ad-slot="post_after_p3"[\s\S]*Paragraph 4/u);
  const short = await (await fetch(`${base}/short-post`)).text();
  assert.doesNotMatch(short, /data-ad-slot="post_after_p3"/u);
  assert.equal((short.match(/data-ad-slot="post_end"/gu) ?? []).length, 1);
  const noConsent = await fetch(`${base}/api/ads/slots/post_end`);
  assert.equal(noConsent.status, 403);
  const consented = await fetch(`${base}/api/ads/slots/post_end`, { headers: { Cookie: "eq-consent=ads" } });
  assert.equal(consented.status, 200);
  assert.equal((await consented.json()).provider, "custom");
  const adsTxt = await fetch(`${base}/ads.txt`);
  assert.match(await adsTxt.text(), /google\.com, pub-1234567890123456, DIRECT/u);
  const search = await (await fetch(`${base}/search?q=none`)).text();
  assert.doesNotMatch(search, /data-ad-slot=|pagead2\.googlesyndication/u);
  const missing = await (await fetch(`${base}/not-a-real-page`)).text();
  assert.doesNotMatch(missing, /data-ad-slot=|pagead2\.googlesyndication/u);
  const legal = await (await fetch(`${base}/privacy-policy`)).text();
  assert.match(legal, /Policy text/u);
  assert.doesNotMatch(legal, /data-ad-slot=|pagead2\.googlesyndication/u);
  const admin = await fetch(`${base}/aadmin/settings/ads`, { redirect: "manual" });
  assert.equal(admin.status, 302);
  adSettings.slots.home_feed.enabled = false;
  clearPublicCache();
  const disabledHome = await (await fetch(base)).text();
  assert.doesNotMatch(disabledHome, /data-ad-slot="home_feed"/u);
});

test("M8 Ads settings page is owner-only and lists all five slots", async (context) => {
  let accountEmail = "editor@example.test";
  const database = { async execute() { return [[]]; }, async getConnection() { throw new Error("No write expected."); } };
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "m8-admin-session", userId: 1 }; next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return { id: 1, email: accountEmail, status: "active", display_name: "Test" }; } }, service: {}, oauthClient: {}, emailer: {} },
    adminM2: { database },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const editor = await fetch(`${base}/aadmin/settings/ads`);
  assert.equal(editor.status, 403);
  accountEmail = "owner@example.test";
  const owner = await fetch(`${base}/aadmin/settings/ads`);
  assert.equal(owner.status, 200);
  const body = await owner.text();
  assert.match(body, /AdSense publisher ID/u);
  for (const slot of ["home_feed", "home_sidebar", "post_after_p3", "post_end", "post_sidebar"]) { assert.match(body, new RegExp(`${slot}_enabled`, "u")); }
});

test("M6 contact forms render without JS and Inbox enforces story versus owner-only message roles", async (context) => {
  let accountEmail = "editor@example.test";
  const siteRepository = emptyPublicSiteRepository();
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "m6-test-session", userId: 1 }; next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return { id: 1, email: accountEmail, display_name: "Test User", status: "active" }; }, async incrementRateLimit() { return { allowed: true }; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: siteRepository, database: { async execute() { return [[]]; } }, commentsService: { async list() { return []; } }, postsService: { async publicContent(_id, html) { return sanitizePostHtml(html); } } },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const storyForm = await fetch(`${base}/contact-us?type=story`);
  assert.equal(storyForm.status, 200);
  assert.match(await storyForm.text(), /Send a story/u);
  const messageForm = await fetch(`${base}/contact-us?type=message`);
  assert.match(await messageForm.text(), /Send a message/u);

  const stories = await fetch(`${base}/aadmin/inbox?tab=stories`);
  assert.equal(stories.status, 200);
  assert.match(await stories.text(), /No new story submissions/u);
  const editorMessages = await fetch(`${base}/aadmin/inbox?tab=messages`);
  assert.equal(editorMessages.status, 403);

  accountEmail = "owner@example.test";
  const ownerMessages = await fetch(`${base}/aadmin/inbox?tab=messages`);
  assert.equal(ownerMessages.status, 200);
  assert.match(await ownerMessages.text(), /No contact messages/u);
});

test("public HTML caches for sixty seconds and skips requests carrying the admin session cookie", async (context) => {
  clearPublicCache();
  let reads = 0;
  const app = createApp({
    sessionMiddleware(_request, _response, next) { next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return null; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: { ...emptyPublicSiteRepository(), async countPublishedAll() { reads += 1; return 0; } } },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const first = await fetch(base);
  assert.equal(first.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  await first.text();
  assert.ok(getPublicCache("html:/"));
  await (await fetch(base)).text();
  assert.equal(reads, 1);
  const sessionResponse = await fetch(base, { headers: { Cookie: "elatedquest.sid=existing-session" } });
  assert.equal(sessionResponse.headers.get("cache-control"), "no-store");
  await sessionResponse.text();
  assert.equal(reads, 2);
  await (await fetch(base)).text();
  assert.equal(reads, 2);
});

test("view counter requires a same-origin request, counts published posts and does not set cookies", async (context) => {
  let count = 0;
  let rateHits = 0;
  const siteRepository = { ...emptyPublicSiteRepository(), async incrementPublishedView(id) { if (id !== 12) { return false; } count += 1; return true; } };
  const app = createApp({
    sessionMiddleware(_request, _response, next) { next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return null; }, async incrementRateLimit(_key, limit) { rateHits += 1; return { allowed: rateHits <= limit }; } }, service: {}, oauthClient: {}, emailer: {} },
    site: { repository: siteRepository },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = "http://127.0.0.1:" + server.address().port + "/api/posts/12/view";
  const valid = await fetch(endpoint, { method: "POST", headers: { Origin: "http://localhost:3000" } });
  assert.equal(valid.status, 204);
  assert.equal(valid.headers.get("set-cookie"), null);
  assert.equal(count, 1);
  const foreign = await fetch(endpoint, { method: "POST", headers: { Origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
  const noOrigin = await fetch(endpoint, { method: "POST" });
  assert.equal(noOrigin.status, 403);
  const referer = await fetch(endpoint, { method: "POST", headers: { Referer: "http://localhost:3000/post" } });
  assert.equal(referer.status, 204);
  const missing = await fetch(endpoint.replace("/12/", "/999/"), { method: "POST", headers: { Origin: "http://localhost:3000" } });
  assert.equal(missing.status, 404);
  const bot = await fetch(endpoint, { method: "POST", headers: { "User-Agent": "SampleBot/1.0" } });
  assert.equal(bot.status, 204);
  assert.equal(count, 2);
  for (let index = 0; index < 55; index += 1) {
    const allowed = await fetch(endpoint, { method: "POST", headers: { Origin: "http://localhost:3000" } });
    assert.equal(allowed.status, 204);
  }
  const limited = await fetch(endpoint, { method: "POST", headers: { Origin: "http://localhost:3000" } });
  assert.equal(limited.status, 429);
  assert.equal(count, 57);
});

test("admin preview renders the public post page uncached without a view marker", async (context) => {
  clearPublicCache();
  const adminPost = { id: 12, title: "Draft preview", slug: "draft-preview", excerpt: "Preview excerpt", content_html: "<p>Preview body</p><script>bad()</script>", content_text: "Preview body", author_id: 4, created_by: 1, status: "draft", published_at: null, reading_minutes: 1, view_count: 0, comment_count: 0, tags: [] };
  const database = {
    async execute(sql) {
      if (sql.startsWith("SELECT p.*")) { return [[adminPost]]; }
      if (sql.startsWith("SELECT t.id")) { return [[]]; }
      if (sql.startsWith("SELECT m.file_name")) { return [[]]; }
      throw new Error("Unexpected preview query.");
    },
  };
  const publicPost = { ...adminPost, category_name: null, author_name: "Writer", author_slug: "writer", author_avatar_url: null, cover_url: null, cover_credit_url: null };
  const publicRepository = {
    ...emptyPublicSiteRepository(),
    async previewPostById(id) { return id === 12 ? publicPost : null; },
  };
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "existing-admin-session", userId: 1 }; next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return { id: 1, email: "owner@example.test", role: "owner", status: "active" }; } }, service: {}, oauthClient: {}, emailer: {} },
    adminM2: { database },
    site: { repository: publicRepository },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/aadmin/preview/12");
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(body, /Preview · visible only to you/u);
  assert.match(body, /href="\/css\/public-site\.css"/u);
  assert.match(body, /name="robots" content="noindex,nofollow"/u);
  assert.doesNotMatch(body, /data-feature="view-counter"/u);
  assert.doesNotMatch(body, /preview-ad-placeholder|bad\(\)/u);
  assert.equal((body.match(/<h1\b/gu) ?? []).length, 1);
});

test("500 responses show a generic page and log details only with a request ID", async (context) => {
  const logged = [];
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "broken-session", userId: 3 }; next(); },
    logError(...args) { logged.push(args); },
    auth: {
      ownerEmail: "owner@example.test",
      repository: { async findUserById() { throw new Error("SQL_SECRET_DETAIL SELECT * FROM users"); } },
      service: {}, oauthClient: {}, emailer: {},
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/aadmin/login`);
  const body = await response.text();
  const requestId = response.headers.get("x-request-id");
  assert.equal(response.status, 500);
  assert.match(body, /Something went wrong/);
  assert.match(body, new RegExp(requestId));
  assert.doesNotMatch(body, /SQL_SECRET_DETAIL|SELECT \* FROM users/);
  assert.equal(logged[0][0], `request_id=${requestId}`);
  assert.match(logged[0][1].message, /SQL_SECRET_DETAIL/);
});

test("admin stylesheet is served and page responses carry the stylesheet CSP allowance", async (context) => {
  const app = createApp({
    sessionMiddleware(request, _response, next) { request.session = { id: "asset-test" }; next(); },
    auth: { ownerEmail: "owner@example.test", repository: { async findUserById() { return null; } }, service: {}, oauthClient: {}, emailer: {} },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/aadmin/login`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /href="\/css\/site\.css"/);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  const css = await fetch(`${base}/css/site.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  const stylesheet = await css.text();
  assert.match(stylesheet, /\.admin-sidebar/);
  assert.match(stylesheet, /\.btn--secondary/);
  assert.match(stylesheet, /\.media-upload__preview\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  assert.match(stylesheet, /\.date-filter__picker/);
  assert.doesNotMatch(stylesheet, /\.public-header\s*\{/u);
  const publicCss = await fetch(`${base}/css/public-site.css`);
  assert.equal(publicCss.status, 200);
  const publicStylesheet = await publicCss.text();
  assert.match(publicStylesheet, /\.public-header\s*\{/u);
  assert.doesNotMatch(publicStylesheet, /\.admin-sidebar\s*\{/u);
});
