import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import mysql from "mysql2/promise";
import session from "express-session";
import express from "express";
import sharp from "sharp";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
const { buildPostPayload } = await import("../../public/js/admin/post-payload.js");

test("real-schema owner/editor admin smoke test", { skip: !enabled }, async (context) => {
  if (!process.env.DB_USER) {
    try {
      process.loadEnvFile();
    } catch (error) {
      if (error.code !== "ENOENT") { throw error; }
    }
  }
  const testUploadDirectory = await mkdtemp(path.join(os.tmpdir(), "elatedquest-media-integration-"));
  process.env.UPLOAD_DIR = testUploadDirectory;
  const testDatabase = process.env.DB_TEST_NAME || process.env.DB_NAME;
  assert.equal(testDatabase, "elatedquest_m0_test", "integration test must use the designated M0 test database");
  process.env.DB_NAME = testDatabase;
  const schema = await readFile(path.join(process.cwd(), "database", "schema.sql"), "utf8");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: testDatabase,
    multipleStatements: true,
    timezone: "+00:00",
    charset: "utf8mb4",
  });
  const schemaTables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gu)].map((match) => match[1]);
  const [actualTables] = await connection.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = ?",
    ["BASE TABLE"],
  );
  const actualTableNames = new Set(actualTables.map((row) => row.TABLE_NAME));
  for (const tableName of schemaTables) {
    assert.ok(actualTableNames.has(tableName), `test database is missing schema table ${tableName}`);
  }
  const [aboutColumn] = await connection.execute(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    ["authors", "show_on_about"],
  );
  assert.equal(Number(aboutColumn[0].count), 1, "test database is missing authors.show_on_about");

  const ownerEmail = process.env.OWNER_EMAIL.trim().toLowerCase();
  const [oldOwners] = await connection.execute(
    "SELECT id, role, status FROM users WHERE email = ?",
    [ownerEmail],
  );
  await connection.execute(
    "INSERT INTO users (email, role, status) VALUES (?, 'owner', 'active') ON DUPLICATE KEY UPDATE role = 'owner', status = 'active'",
    [ownerEmail],
  );
  const [owners] = await connection.execute("SELECT id FROM users WHERE email = ?", [ownerEmail]);
  const ownerId = owners[0].id;
  const [ownerAuthorsBefore] = await connection.execute("SELECT id FROM authors WHERE user_id = ?", [ownerId]);
  const settingsKeys = ["general", "comments", "editors_can_publish"];
  const [settingsBefore] = await connection.execute(
    "SELECT setting_key, CAST(setting_value AS CHAR) AS setting_value, updated_by, updated_at FROM site_settings WHERE setting_key IN (?, ?, ?)",
    settingsKeys,
  );
  const [[auditMarker]] = await connection.execute("SELECT COALESCE(MAX(id), 0) AS id FROM audit_log");

  const editorEmail = `m3-smoke-${Date.now()}@example.test`;
  const [editorInsert] = await connection.execute(
    "INSERT INTO users (email, role, status) VALUES (?, 'editor', 'active')",
    [editorEmail],
  );
  const editorId = editorInsert.insertId;
  const otherEditorEmail = `m3-other-${Date.now()}@example.test`;
  const [otherEditorInsert] = await connection.execute("INSERT INTO users (email, role, status) VALUES (?, 'editor', 'active')", [otherEditorEmail]);
  const otherEditorId = otherEditorInsert.insertId;
  const rateKeys = [
    `admin-write:${ownerId}`,
    `admin-write:${editorId}`,
    "auth-ip:127.0.0.1",
    "email-ip:127.0.0.1",
    `email:${createHash("sha256").update(`${process.env.HASH_SECRET}:${editorEmail}`).digest("hex")}`,
  ];
  const [rateLimitsBefore] = await connection.execute(
    "SELECT rl_key, hits, window_start FROM rate_limits WHERE rl_key IN (?, ?, ?, ?, ?)",
    rateKeys,
  );
  await connection.execute("DELETE FROM rate_limits WHERE rl_key IN (?, ?, ?, ?, ?)", rateKeys);

  let invitedEmail = null;
  let invitedId = null;
  let editorAuthorId = null;
  let guestAuthorId = null;
  let smokePostSlug = null;
  let createdPostId = null;
  let newRoutePostId = null;
  let createdMediaId = null;
  const uploadedMediaIds = [];
  const mediaRateKey = `media-upload:${ownerId}`;
  const [[mediaRateBefore]] = await connection.execute("SELECT rl_key, hits, window_start FROM rate_limits WHERE rl_key = ?", [mediaRateKey]);
  await connection.execute("DELETE FROM rate_limits WHERE rl_key = ?", [mediaRateKey]);
  const mediaEditorRateKey = `media-upload:${editorId}`;
  const [[mediaEditorRateBefore]] = await connection.execute("SELECT rl_key, hits, window_start FROM rate_limits WHERE rl_key = ?", [mediaEditorRateKey]);
  await connection.execute("DELETE FROM rate_limits WHERE rl_key = ?", [mediaEditorRateKey]);
  let createdCategoryId = null;
  let createdOldSlug = null;
  let disposableCategoryId = null;
  const pagePostIds = [];

  const store = new session.MemoryStore();
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  });
  const bootstrap = express();
  bootstrap.use(sessionMiddleware);
  bootstrap.get("/session/:id", (request, response) => {
    request.session.userId = request.params.id;
    response.sendStatus(204);
  });
  const bootstrapServer = bootstrap.listen(0, "127.0.0.1");
  await new Promise((resolve) => bootstrapServer.once("listening", resolve));
  const bootstrapBase = `http://127.0.0.1:${bootstrapServer.address().port}`;
  async function cookieFor(id) {
    const response = await fetch(`${bootstrapBase}/session/${id}`);
    return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  }
  const ownerCookie = await cookieFor(ownerId);
  const editorCookie = await cookieFor(editorId);
  const otherEditorCookie = await cookieFor(otherEditorId);

  const [{ createApp }, { createAuthRepository }, { createAuthService }, { pool }] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/modules/auth/repository.js"),
    import("../../src/modules/auth/service.js"),
    import("../../src/db/pool.js"),
  ]);
  const [[sessionZone]] = await pool.execute("SELECT @@session.time_zone AS sessionZone");
  assert.equal(sessionZone.sessionZone, "+00:00");
  const authRepository = createAuthRepository(pool);
  const app = createApp({
    sessionMiddleware,
    auth: {
      ownerEmail,
      database: pool,
      repository: authRepository,
      emailer: { async sendInviteNotice() {}, async sendSignInLink() {} },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(async () => {
    server.closeAllConnections();
    bootstrapServer.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => bootstrapServer.close(resolve));
    if (smokePostSlug) {
      await connection.execute("DELETE FROM posts WHERE slug = ?", [smokePostSlug]);
    }
    if (createdPostId) { await connection.execute("DELETE FROM posts WHERE id = ?", [createdPostId]); }
    if (newRoutePostId) { await connection.execute("DELETE FROM posts WHERE id = ?", [newRoutePostId]); }
    if (createdOldSlug) {
      await connection.execute("DELETE FROM redirects WHERE from_slug = ?", [createdOldSlug]);
      await connection.execute("DELETE FROM redirects WHERE from_slug = ?", [`older-${createdOldSlug}`]);
    }
    for (const postId of pagePostIds) { await connection.execute("DELETE FROM posts WHERE id = ?", [postId]); }
    if (createdMediaId) { await connection.execute("DELETE FROM media WHERE id = ?", [createdMediaId]); }
    for (const mediaId of uploadedMediaIds) {
      await connection.execute("DELETE FROM media WHERE id = ?", [mediaId]);
    }
    if (createdCategoryId) { await connection.execute("DELETE FROM categories WHERE id = ?", [createdCategoryId]); }
    if (disposableCategoryId) { await connection.execute("DELETE FROM categories WHERE id = ?", [disposableCategoryId]); }
    if (editorAuthorId) { await connection.execute("DELETE FROM authors WHERE id = ?", [editorAuthorId]); }
    if (guestAuthorId) { await connection.execute("DELETE FROM authors WHERE id = ?", [guestAuthorId]); }
    if (!ownerAuthorsBefore.length) {
      await connection.execute("DELETE FROM authors WHERE user_id = ? AND slug = ?", [ownerId, `owner-${ownerId}`]);
    }
    await connection.execute("DELETE FROM login_tokens WHERE email IN (?, ?)", [editorEmail, invitedEmail ?? editorEmail]);
    if (invitedId) { await connection.execute("DELETE FROM users WHERE id = ?", [invitedId]); }
    await connection.execute("DELETE FROM users WHERE id = ?", [editorId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [otherEditorId]);
    await connection.execute("DELETE FROM audit_log WHERE id > ?", [auditMarker.id]);
    await connection.execute("DELETE FROM site_settings WHERE setting_key IN (?, ?, ?)", settingsKeys);
    for (const setting of settingsBefore) {
      await connection.execute(
        "INSERT INTO site_settings (setting_key, setting_value, updated_by, updated_at) VALUES (?, ?, ?, ?)",
        [setting.setting_key, setting.setting_value, setting.updated_by, setting.updated_at],
      );
    }
    await connection.execute("DELETE FROM rate_limits WHERE rl_key IN (?, ?, ?, ?, ?)", rateKeys);
    for (const entry of rateLimitsBefore) {
      await connection.execute(
        "INSERT INTO rate_limits (rl_key, hits, window_start) VALUES (?, ?, ?)",
        [entry.rl_key, entry.hits, entry.window_start],
      );
    }
    await connection.execute("DELETE FROM rate_limits WHERE rl_key = ?", [mediaRateKey]);
    if (mediaRateBefore) { await connection.execute("INSERT INTO rate_limits (rl_key, hits, window_start) VALUES (?, ?, ?)", [mediaRateBefore.rl_key, mediaRateBefore.hits, mediaRateBefore.window_start]); }
    await connection.execute("DELETE FROM rate_limits WHERE rl_key = ?", [mediaEditorRateKey]);
    if (mediaEditorRateBefore) { await connection.execute("INSERT INTO rate_limits (rl_key, hits, window_start) VALUES (?, ?, ?)", [mediaEditorRateBefore.rl_key, mediaEditorRateBefore.hits, mediaEditorRateBefore.window_start]); }
    if (oldOwners.length) {
      await connection.execute("UPDATE users SET role = ?, status = ? WHERE id = ?", [oldOwners[0].role, oldOwners[0].status, ownerId]);
    } else {
      await connection.execute("DELETE FROM users WHERE id = ?", [ownerId]);
    }
    await connection.end();
    await pool.end();
    try { rmSync(testUploadDirectory, { recursive: true, force: true }); } catch { /* Windows may briefly hold a streamed fixture file. */ }
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(url, cookie) {
    return fetch(`${base}${url}`, { headers: { Cookie: cookie }, redirect: "manual" });
  }
  async function tokenFor(url, cookie) {
    const response = await get(url, cookie);
    assert.ok(response.status < 500, `${url} returned ${response.status}`);
    const html = await response.text();
    return {
      token: html.match(/name="_csrf" value="([^"]+)"/)?.[1],
      cookies: `${cookie}; ${response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ")}`,
    };
  }
  async function post(url, cookie, token, values, accept = "text/html") {
    return fetch(`${base}${url}`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: cookie, Accept: accept, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values instanceof URLSearchParams ? [...values, ["_csrf", token]] : { ...values, _csrf: token }),
    });
  }
  async function uploadImage(cookie, token, buffer, name = "upload.bin") {
    const form = new FormData();
    form.append("image", new Blob([buffer]), name);
    return fetch(`${base}/api/admin/media`, { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": token, Accept: "application/json" }, body: form });
  }
  async function uploadAsBrowserForm(cookie, token, buffer, name) {
    const form = new FormData();
    form.append("_csrf", token);
    form.append("image", new Blob([buffer]), name);
    return fetch(`${base}/api/admin/media`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" }, body: form });
  }

  const loginForm = await tokenFor("/aadmin/login", "");
  assert.equal((await post("/auth/email", loginForm.cookies, loginForm.token, { email: editorEmail })).status, 200);

  for (const route of ["/aadmin/login", "/aadmin", "/aadmin/team", "/aadmin/team/authors", "/aadmin/profile", "/aadmin/settings", "/aadmin/audit", "/aadmin/categories", "/aadmin/audit?actor=&action=auth.login&from=01%2F01%2F2020&to=31%2F12%2F2035"]) {
    assert.ok((await get(route, ownerCookie)).status < 500, `${route} returned a server error`);
  }
  const dashboardHtml = await (await get("/aadmin", ownerCookie)).text();
  assert.match(dashboardHtml, /<h1>Posts<\/h1>/u);
  assert.match(dashboardHtml, /role-badge--owner">Admin<\/span>\s*<span>[^<]+<\/span>/u);
  for (const route of ["/aadmin", "/aadmin/media", "/aadmin/categories", "/aadmin/team", "/aadmin/team/authors", "/aadmin/profile", "/aadmin/settings", "/aadmin/audit"]) {
    const pageResponse = await get(route, ownerCookie);
    assert.equal(pageResponse.status, 200, `${route} should render for owner`);
    const html = await pageResponse.text();
    for (const link of ["/aadmin", "/aadmin/media", "/aadmin/categories", "/aadmin/team", "/aadmin/team/authors", "/aadmin/profile", "/aadmin/settings", "/aadmin/audit"]) {
      assert.ok(html.includes(`href=\"${link}\"`), `${route} sidebar is missing ${link}`);
    }
  }
  for (const route of ["/aadmin", "/aadmin/profile"]) {
    assert.ok((await get(route, editorCookie)).status < 500, route);
  }
  for (const route of ["/aadmin/team", "/aadmin/team/authors", "/aadmin/settings", "/aadmin/audit", "/aadmin/categories"]) {
    assert.equal((await get(route, editorCookie)).status, 403, route);
  }
  for (const route of ["/aadmin", "/aadmin/media", "/aadmin/profile"]) {
    const pageResponse = await get(route, editorCookie);
    assert.equal(pageResponse.status, 200, route);
    const html = await pageResponse.text();
    assert.ok(html.includes('href="/aadmin"'));
    assert.ok(html.includes('href="/aadmin/media"'));
    assert.ok(html.includes('href="/aadmin/profile"'));
    assert.ok(!html.includes('href="/aadmin/categories"'));
    assert.ok(!html.includes('href="/aadmin/team"'));
  }

  const editorPageRoutes = ["/aadmin", "/aadmin/media", "/aadmin/profile"];
  const ownerPageRoutes = ["/aadmin", "/aadmin/media", "/aadmin/team", "/aadmin/team/authors", "/aadmin/profile", "/aadmin/settings", "/aadmin/audit", "/aadmin/categories"];
  for (const [role, routes, cookie] of [["editor", editorPageRoutes, editorCookie], ["owner", ownerPageRoutes, ownerCookie]]) {
    for (const route of routes) {
      const response = await get(route, cookie);
      assert.ok(response.status < 500, `${role} ${route} returned ${response.status}`);
      if (response.status === 200) { assert.match(await response.text(), /href="\/css\/site\.css"/u, `${role} ${route} is missing its stylesheet`); }
    }
  }
  const loginPage = await get("/aadmin/login", "");
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /href="\/css\/site\.css"/u, "login page is missing its stylesheet");
  const forbiddenPage = await get("/aadmin/team", editorCookie);
  assert.equal(forbiddenPage.status, 403);
  assert.match(await forbiddenPage.text(), /href="\/css\/site\.css"/u, "403 page is missing its stylesheet");
  const missingPage = await get(`/phase-3-smoke-missing-${Date.now()}`, "");
  assert.equal(missingPage.status, 404);
  assert.match(await missingPage.text(), /href="\/css\/site\.css"/u, "404 page is missing its stylesheet");

  const teamForm = await tokenFor("/aadmin/team", ownerCookie);
  const teamHtml = await (await get("/aadmin/team", ownerCookie)).text();
  assert.match(teamHtml, /Last sign-in/u);
  assert.equal((await post(`/api/admin/team/${ownerId}/disable`, teamForm.cookies, teamForm.token, {})).status, 400);
  assert.equal((await post(`/api/admin/team/${ownerId}/remove`, teamForm.cookies, teamForm.token, {})).status, 400);
  const [ownerRows] = await connection.execute("SELECT role, status FROM users WHERE id = ?", [ownerId]);
  assert.deepEqual(ownerRows[0], { role: "owner", status: "active" });

  invitedEmail = `m2-invite-${Date.now()}@example.test`;
  assert.equal((await post("/api/admin/team", teamForm.cookies, teamForm.token, { email: invitedEmail })).status, 302);
  const [invited] = await connection.execute("SELECT id, status FROM users WHERE email = ?", [invitedEmail]);
  invitedId = invited[0].id;
  assert.equal(invited[0].status, "invited");
  assert.equal((await post(`/api/admin/team/${invitedId}/resend`, teamForm.cookies, teamForm.token, {})).status, 302);
  const authService = createAuthService({ repository: authRepository, ownerEmail, hashSecret: process.env.HASH_SECRET, emailer: {} });
  const activated = await authService.login(invitedEmail, "M2 Smoke Invited", { ip: "127.0.0.1" });
  assert.equal(activated.status, "active");
  const [activatedRows] = await connection.execute("SELECT status FROM users WHERE id = ?", [invitedId]);
  assert.equal(activatedRows[0].status, "active");
  assert.equal((await post(`/api/admin/team/${invitedId}/disable`, teamForm.cookies, teamForm.token, {})).status, 302);
  assert.equal((await post(`/api/admin/team/${invitedId}/enable`, teamForm.cookies, teamForm.token, {})).status, 302);

  const profileForm = await tokenFor("/aadmin/profile", editorCookie);
  assert.equal((await post("/api/admin/profile", profileForm.cookies, profileForm.token, { display_name: "M2 Smoke Editor", bio: "Smoke test", show_on_about: "1" })).status, 302);
  const updatedEditorHeader = await (await get("/aadmin", editorCookie)).text();
  assert.match(updatedEditorHeader, /role-badge--editor">Content Moderator<\/span>\s*<span>M2 Smoke Editor<\/span>/u);
  const [editorAuthors] = await connection.execute("SELECT id, show_on_about FROM authors WHERE user_id = ?", [editorId]);
  editorAuthorId = editorAuthors[0].id;
  assert.equal(editorAuthors[0].show_on_about, 1);
  smokePostSlug = `m3-smoke-post-${Date.now()}`;
  await connection.execute(
    "INSERT INTO posts (title, slug, author_id, created_by, status) VALUES (?, ?, ?, ?, 'draft')",
    ["M2 smoke post", smokePostSlug, editorAuthorId, editorId],
  );
  const [[ownedEditorPost]] = await connection.execute("SELECT id, updated_at FROM posts WHERE slug = ?", [smokePostSlug]);
  const oneCharacterSuggestions = await get("/api/admin/posts/suggest?q=s", editorCookie);
  assert.deepEqual(await oneCharacterSuggestions.json(), []);
  const editorSuggestionsResponse = await get("/api/admin/posts/suggest?q=smoke", editorCookie);
  const editorSuggestions = await editorSuggestionsResponse.json();
  assert.ok(editorSuggestions.length <= 8);
  assert.ok(editorSuggestions.some((item) => Number(item.id) === Number(ownedEditorPost.id)));
  assert.deepEqual(await (await get("/api/admin/posts/suggest?q=smoke", otherEditorCookie)).json(), []);
  const selectedPostDashboard = await get(`/aadmin?search=smoke&post_id=${ownedEditorPost.id}`, editorCookie);
  assert.match(await selectedPostDashboard.text(), /M2 smoke post/u);
  for (const [role, route, cookie] of [["editor", `/aadmin/posts/${ownedEditorPost.id}`, editorCookie], ["owner", `/aadmin/posts/${ownedEditorPost.id}`, ownerCookie], ["editor preview", `/aadmin/preview/${ownedEditorPost.id}`, editorCookie]]) {
    const response = await get(route, cookie);
    assert.equal(response.status, 200, `${role} ${route}`);
    assert.match(await response.text(), /href="\/css\/site\.css"/u, `${role} ${route} is missing its stylesheet`);
  }
  assert.equal((await get(`/aadmin/posts/${ownedEditorPost.id}`, otherEditorCookie)).status, 404);
  assert.equal((await get(`/aadmin/posts/${ownedEditorPost.id}`, ownerCookie)).status, 200);
  const editorPostForm = await tokenFor(`/aadmin/posts/${ownedEditorPost.id}`, editorCookie);
  const sqlStamp = (value) => new Date(value).toISOString().slice(0, 19).replace("T", " ");
  const submitResponse = await post(`/api/admin/posts/${ownedEditorPost.id}/submit`, editorPostForm.cookies, editorPostForm.token, { expected_updated_at: sqlStamp(ownedEditorPost.updated_at) });
  assert.equal(submitResponse.status, 302, await submitResponse.text());
  const lockedEditorResponse = await get(`/aadmin/posts/${ownedEditorPost.id}`, editorCookie);
  assert.equal(lockedEditorResponse.status, 200);
  const lockedEditorHtml = await lockedEditorResponse.text();
  assert.match(lockedEditorHtml, /read-only/u);
  assert.doesNotMatch(lockedEditorHtml, /id="quill-editor"/u);
  const [[reviewPost]] = await connection.execute("SELECT updated_at FROM posts WHERE id = ?", [ownedEditorPost.id]);
  const lockedEdit = await post(`/aadmin/posts/${ownedEditorPost.id}`, editorPostForm.cookies, editorPostForm.token, { expected_updated_at: sqlStamp(reviewPost.updated_at), title: "Forbidden edit" });
  assert.equal(lockedEdit.status, 403);
  const otherEditorForm = await tokenFor("/aadmin", otherEditorCookie);
  const foreignEdit = await post(`/aadmin/posts/${ownedEditorPost.id}`, otherEditorForm.cookies, otherEditorForm.token, { expected_updated_at: sqlStamp(reviewPost.updated_at), title: "Foreign edit" });
  assert.equal(foreignEdit.status, 403);
  const ownerDashboard = await tokenFor("/aadmin", ownerCookie);
  assert.equal((await post(`/api/admin/posts/${ownedEditorPost.id}/reject`, ownerDashboard.cookies, ownerDashboard.token, { note: "Please add details.", expected_updated_at: sqlStamp(reviewPost.updated_at) })).status, 302);
  const [[returnedPost]] = await connection.execute("SELECT status, updated_at, review_note FROM posts WHERE id = ?", [ownedEditorPost.id]);
  assert.equal(returnedPost.status, "draft");
  assert.equal(returnedPost.review_note, "Please add details.");
  const missingPublish = await post(`/api/admin/posts/${ownedEditorPost.id}/publish`, ownerDashboard.cookies, ownerDashboard.token, { expected_updated_at: sqlStamp(returnedPost.updated_at) });
  assert.equal(missingPublish.status, 409);
  assert.match(await missingPublish.text(), /cover image with alt text/u);

  const categoryForm = await tokenFor("/aadmin/categories", ownerCookie);
  const newPostForm = await tokenFor("/aadmin", ownerCookie);
  const newPostResponse = await post("/aadmin/posts/new", newPostForm.cookies, newPostForm.token, {});
  assert.equal(newPostResponse.status, 302);
  assert.match(newPostResponse.headers.get("location"), /^\/aadmin\/posts\/\d+$/u);
  newRoutePostId = Number(newPostResponse.headers.get("location").split("/").at(-1));
  const [[newRoutePost]] = await connection.execute("SELECT title, status, created_by, author_id FROM posts WHERE id = ?", [newRoutePostId]);
  assert.equal(newRoutePost.title, "Untitled draft");
  assert.equal(newRoutePost.status, "draft");
  assert.equal(Number(newRoutePost.created_by), Number(ownerId));
  assert.ok(Number(newRoutePost.author_id) > 0, "new draft gets the creator's author profile");
  const categorySlug = `m3-smoke-category-${Date.now()}`;
  assert.equal((await post("/api/admin/categories", categoryForm.cookies, categoryForm.token, { name: "M3 Smoke", slug: categorySlug, description: "A category description", sort_order: "4", show_in_nav: "1" })).status, 302);
  const [[createdCategory]] = await connection.execute("SELECT id FROM categories WHERE slug = ?", [categorySlug]);
  createdCategoryId = createdCategory.id;
  assert.equal((await post(`/api/admin/categories/${createdCategoryId}`, categoryForm.cookies, categoryForm.token, { name: "M3 Smoke Updated", slug: `${categorySlug}-renamed`, description: "Updated description", sort_order: "5", show_in_nav: "0" })).status, 302);
  const [[renamedCategory]] = await connection.execute("SELECT slug, description, show_in_nav FROM categories WHERE id = ?", [createdCategoryId]);
  assert.deepEqual(renamedCategory, { slug: `${categorySlug}-renamed`, description: "Updated description", show_in_nav: 0 });
  const disposableSlug = `${categorySlug}-delete`;
  assert.equal((await post("/api/admin/categories", categoryForm.cookies, categoryForm.token, { name: "M3 Disposable", slug: disposableSlug, sort_order: "6", show_in_nav: "0" })).status, 302);
  const [[disposableCategory]] = await connection.execute("SELECT id FROM categories WHERE slug = ?", [disposableSlug]);
  disposableCategoryId = disposableCategory.id;
  assert.equal((await post(`/api/admin/categories/${disposableCategoryId}/delete`, categoryForm.cookies, categoryForm.token, {})).status, 302);
  disposableCategoryId = null;

  const dashboardForm = await tokenFor("/aadmin", ownerCookie);
  const ownerSearch = await get(`/aadmin?search=${encodeURIComponent("M3 Smoke Article")}`, ownerCookie);
  assert.equal(ownerSearch.status, 200);
  const editorSearch = await get(`/aadmin?search=${encodeURIComponent("M3 Smoke Article")}`, editorCookie);
  assert.equal(editorSearch.status, 200);
  assert.match(await editorSearch.text(), /No posts found/u);
  const createResponse = await post("/aadmin/posts", dashboardForm.cookies, dashboardForm.token, {});
  assert.equal(createResponse.status, 302);
  const postPath = createResponse.headers.get("location");
  const createdPostForm = await tokenFor(postPath, ownerCookie);
  createdPostId = Number(postPath.split("/").at(-1));
  const mediaSlug = `m3-smoke-${Date.now()}.webp`;
  const [mediaInsert] = await connection.execute("INSERT INTO media (file_name, url_path, mime, alt_text, uploaded_by) VALUES (?, ?, 'image/webp', 'Smoke image', ?)", [mediaSlug, `/uploads/${mediaSlug}`, ownerId]);
  createdMediaId = mediaInsert.insertId;
  const ownerMediaPage = await get("/aadmin/media", ownerCookie);
  assert.equal(ownerMediaPage.status, 200);
  assert.ok(ownerMediaPage.headers.get("content-security-policy").includes(`img-src 'self' ${new URL(process.env.UPLOADS_PUBLIC_URL).origin}`));
  const mediaPageHtml = await ownerMediaPage.text();
  assert.match(mediaPageHtml, /data-upload-preview hidden/u);
  assert.match(mediaPageHtml, /Upload image/u);
  assert.equal((await get("/aadmin/media", editorCookie)).status, 200);
  assert.equal((await get("/api/admin/media?page=1", otherEditorCookie)).status, 200);
  const mediaForm = await tokenFor("/aadmin/media", ownerCookie);
  const editorMediaForm = await tokenFor("/aadmin/media", editorCookie);
  const imageFormats = ["jpeg", "png", "webp", "gif"];
  let editorAvatarMediaId = null;
  for (const format of imageFormats) {
    const image = sharp({ create: { width: 2100, height: 50, channels: 3, background: "#346c9a" } });
    if (format === "jpeg") { image.withExif({ IFD0: { Artist: "Upload fixture" } }); }
    const source = await image.toFormat(format).toBuffer();
    const uploadForm = format === "png" ? editorMediaForm : mediaForm;
    const response = await uploadImage(uploadForm.cookies, uploadForm.token, source, `fixture.${format}`);
    assert.equal(response.status, 201, await response.clone().text());
    const result = await response.json();
    uploadedMediaIds.push(result.id);
    assert.match(result.file_name, /^[0-9a-f-]+\.webp$/u);
    assert.equal(result.no_alt, true);
    const [[stored]] = await connection.execute("SELECT url_path, width, height, size_bytes, mime, alt_text, credit_text FROM media WHERE id = ?", [result.id]);
    assert.equal(stored.mime, "image/webp");
    assert.equal(stored.alt_text, null);
    assert.equal(stored.credit_text, null);
    if (format === "png") { const [[uploadedByEditor]] = await connection.execute("SELECT uploaded_by FROM media WHERE id = ?", [result.id]); assert.equal(Number(uploadedByEditor.uploaded_by), editorId); }
    assert.ok(stored.width <= 2000);
    const localRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");
    const localFile = path.resolve(localRoot, stored.url_path.replace(/^\/uploads\//u, ""));
    assert.ok(localFile.startsWith(`${localRoot}${path.sep}`));
    const mainMeta = await sharp(localFile).metadata();
    assert.equal(mainMeta.format, "webp");
    assert.equal(mainMeta.width, stored.width);
    assert.equal(mainMeta.exif, undefined);
    const prefix = result.file_name.replace(/\.webp$/u, "");
    for (const width of [400, 800, 1200]) {
      const variant = path.join(path.dirname(localFile), `${prefix}-${width}.webp`);
      assert.equal((await sharp(variant).metadata()).width, width);
    }
    if (format === "jpeg") { editorAvatarMediaId = result.id; }
    const served = await get(stored.url_path, ownerCookie);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.match(served.headers.get("cache-control"), /immutable/u);
    await served.arrayBuffer();
  }
  const browserUploadBytes = await sharp({ create: { width: 24, height: 16, channels: 3, background: "#3679a5" } }).png().toBuffer();
  const browserUpload = await uploadAsBrowserForm(mediaForm.cookies, mediaForm.token, browserUploadBytes, "browser-form.png");
  assert.equal(browserUpload.status, 302);
  assert.equal(browserUpload.headers.get("location"), "/aadmin/media?uploaded=1");
  const [[browserUploadedMedia]] = await connection.execute("SELECT id FROM media ORDER BY id DESC LIMIT 1");
  const browserUploadedMediaId = Number(browserUploadedMedia.id);
  uploadedMediaIds.push(browserUploadedMediaId);
  const refreshedMediaHtml = await (await get("/aadmin/media", ownerCookie)).text();
  assert.match(refreshedMediaHtml, /width="400" height="400" loading="lazy"/u);
  assert.match(refreshedMediaHtml, /no alt/u);
  const pickerResponse = await get("/api/admin/media?page=1", editorCookie);
  const pickerItems = await pickerResponse.json();
  const pickerItem = pickerItems.find((item) => item.id === editorAvatarMediaId);
  assert.ok(pickerItem);
  for (const field of ["id", "url", "thumbnail_url", "alt_text", "width", "height", "no_alt"]) { assert.ok(Object.hasOwn(pickerItem, field), `picker missing ${field}`); }
  assert.equal(pickerItem.no_alt, true);
  assert.equal((await post(`/api/admin/media/${editorAvatarMediaId}/delete`, editorCookie, mediaForm.token, {})).status, 403);
  const editorProfileForm = await tokenFor("/aadmin/profile", editorCookie);
  assert.equal((await post("/api/admin/profile", editorProfileForm.cookies, editorProfileForm.token, { display_name: "M2 Smoke Editor", bio: "Smoke test", show_on_about: "1", avatar_media_id: String(editorAvatarMediaId) })).status, 302);
  const [[profileAvatar]] = await connection.execute("SELECT avatar_media_id FROM authors WHERE user_id = ?", [editorId]);
  assert.equal(Number(profileAvatar.avatar_media_id), editorAvatarMediaId);
  const fakeJpeg = await uploadImage(mediaForm.cookies, mediaForm.token, Buffer.from("plain text payload"), "renamed.jpg");
  assert.equal(fakeJpeg.status, 415);
  const svgUpload = await uploadImage(mediaForm.cookies, mediaForm.token, Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"), "image.svg");
  assert.equal(svgUpload.status, 415);
  const oversizedUpload = await uploadImage(mediaForm.cookies, mediaForm.token, Buffer.alloc(8 * 1024 * 1024 + 1), "large.jpg");
  assert.equal(oversizedUpload.status, 413);
  const [[insertedMedia]] = await connection.execute("SELECT url_path FROM media WHERE id = ?", [editorAvatarMediaId]);
  await connection.execute("UPDATE posts SET cover_media_id = ?, og_media_id = ?, content_html = ? WHERE id = ?", [editorAvatarMediaId, editorAvatarMediaId, `<p><img src=\"${insertedMedia.url_path}\" alt=\"test\"></p>`, createdPostId]);
  const usedDelete = await fetch(`${base}/api/admin/media/${editorAvatarMediaId}/delete`, { method: "POST", headers: { Cookie: mediaForm.cookies, "X-CSRF-Token": mediaForm.token, Accept: "application/json" } });
  assert.equal(usedDelete.status, 409);
  const usedDetails = await usedDelete.json();
  for (const useType of ["Cover", "Open Graph image", "Post body", "Author avatar"]) { assert.ok(usedDetails.uses.some((use) => use.use_type === useType), `missing image use ${useType}`); }
  assert.match(usedDetails.error, /Untitled draft/u);
  await connection.execute("UPDATE posts SET cover_media_id = NULL, og_media_id = NULL, content_html = NULL WHERE id = ?", [createdPostId]);
  await connection.execute("UPDATE authors SET avatar_media_id = NULL WHERE user_id = ?", [editorId]);
  const browserAccept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
  const detailsSave = await post(`/api/admin/media/${editorAvatarMediaId}`, editorProfileForm.cookies, editorProfileForm.token, { alt_text: "Cover image alt", credit_text: "Photographer", credit_url: "https://example.test/credit" }, browserAccept);
  assert.equal(detailsSave.status, 302);
  assert.equal(detailsSave.headers.get("location"), "/aadmin/media?saved=1");
  const [[savedMediaDetails]] = await connection.execute("SELECT alt_text, credit_text, credit_url FROM media WHERE id = ?", [editorAvatarMediaId]);
  assert.deepEqual(savedMediaDetails, { alt_text: "Cover image alt", credit_text: "Photographer", credit_url: "https://example.test/credit" });
  const [[inlineCreditMedia]] = await connection.execute("SELECT url_path FROM media WHERE id = ?", [editorAvatarMediaId]);
  await connection.execute("UPDATE posts SET content_html = ? WHERE id = ?", [`<p><img src=\"${inlineCreditMedia.url_path}\" alt=\"Inline image\"></p>`, createdPostId]);
  const inlineCreditPreview = await get(`/aadmin/preview/${createdPostId}`, ownerCookie);
  const inlineCreditPreviewHtml = await inlineCreditPreview.text();
  assert.match(inlineCreditPreviewHtml, /<figcaption>Photographer · <a href="https:\/\/example\.test\/credit"/u);
  assert.doesNotMatch(inlineCreditPreviewHtml, /<figure><figure/u);
  await connection.execute("UPDATE posts SET content_html = NULL WHERE id = ?", [createdPostId]);
  const invalidCredit = await post(`/api/admin/media/${editorAvatarMediaId}`, editorProfileForm.cookies, editorProfileForm.token, { alt_text: "Alt", credit_text: "Credit", credit_url: "javascript:alert(1)" });
  assert.equal(invalidCredit.status, 400);
  assert.ok((await (await get("/aadmin/team/authors", ownerCookie)).text()).includes("Browse media"));
  const [[currentRate]] = await connection.execute("SELECT hits FROM rate_limits WHERE rl_key = ?", [mediaRateKey]);
  await connection.execute("UPDATE rate_limits SET hits = 30, window_start = UTC_TIMESTAMP() WHERE rl_key = ?", [mediaRateKey]);
  const limitedUpload = await uploadImage(mediaForm.cookies, mediaForm.token, Buffer.from("limit"), "limit.jpg");
  assert.equal(limitedUpload.status, 429);
  await connection.execute("UPDATE rate_limits SET hits = ? WHERE rl_key = ?", [Number(currentRate.hits), mediaRateKey]);
  const traversal = await get("/uploads/%2e%2e/%2e%2e/server.js", ownerCookie);
  assert.equal(traversal.status, 404);
  const unusedDeleteId = browserUploadedMediaId;
  const unusedDelete = await post(`/api/admin/media/${unusedDeleteId}/delete`, mediaForm.cookies, mediaForm.token, {}, browserAccept);
  assert.equal(unusedDelete.status, 302);
  assert.equal(unusedDelete.headers.get("location"), "/aadmin/media?deleted=1");
  uploadedMediaIds.splice(uploadedMediaIds.indexOf(unusedDeleteId), 1);
  await connection.execute("UPDATE posts SET title = '', slug = '' WHERE id = ?", [createdPostId]);
  const [[incompletePost]] = await connection.execute("SELECT updated_at FROM posts WHERE id = ?", [createdPostId]);
  const missingBeforeSave = await post(`/api/admin/posts/${createdPostId}/publish`, createdPostForm.cookies, createdPostForm.token, { expected_updated_at: sqlStamp(incompletePost.updated_at) });
  assert.equal(missingBeforeSave.status, 409);
  for (const missing of ["title", "slug", "cover image with alt text", "category", "body", "meta description"]) { assert.match(await missingBeforeSave.clone().text(), new RegExp(missing, "u")); }
  const firstSave = {
    expected_updated_at: sqlStamp(incompletePost.updated_at), title: "M3 Smoke Article", slug: `m3-smoke-article-${Date.now()}`, excerpt: "", content_html: "<script>alert(1)</script><p>Safe body</p>", category_id: String(createdCategoryId), tags: "M3, Testing", seo_title: "M3 Smoke", seo_description: "A sufficiently descriptive meta description for the smoke article.", cover_media_id: String(createdMediaId), allow_comments: "1",
  };
  const editorPayload = buildPostPayload(firstSave, { contentHtml: firstSave.content_html, expectedUpdatedAt: firstSave.expected_updated_at });
  assert.equal((await post(postPath, createdPostForm.cookies, createdPostForm.token, editorPayload)).status, 302);
  const [[allSavedFields]] = await connection.execute("SELECT title, excerpt, category_id, seo_title, seo_description, cover_media_id, content_html FROM posts WHERE id = ?", [createdPostId]);
  assert.equal(allSavedFields.title, firstSave.title);
  assert.equal(Number(allSavedFields.category_id), createdCategoryId);
  assert.equal(Number(allSavedFields.cover_media_id), createdMediaId);
  assert.equal(allSavedFields.seo_title, firstSave.seo_title);
  assert.equal(allSavedFields.seo_description, firstSave.seo_description);
  assert.match(allSavedFields.content_html, /Safe body/u);
  const [[tagCount]] = await connection.execute("SELECT COUNT(*) AS count FROM post_tags WHERE post_id = ?", [createdPostId]);
  assert.equal(Number(tagCount.count), 2);
  const staleResponse = await post(postPath, createdPostForm.cookies, createdPostForm.token, firstSave);
  assert.equal(staleResponse.status, 409);
  assert.match(await staleResponse.text(), /changed by/u);
  const [[savedForAutosave]] = await connection.execute("SELECT updated_at FROM posts WHERE id = ?", [createdPostId]);
  const revisionBeforeAutosave = Number((await connection.execute("SELECT COUNT(*) AS count FROM post_revisions WHERE post_id = ?", [createdPostId]))[0][0].count);
  const autosave = await post(postPath, createdPostForm.cookies, createdPostForm.token, { ...firstSave, expected_updated_at: sqlStamp(savedForAutosave.updated_at), autosave: "1", content_html: "<h2>Editor heading</h2><p>Safe <strong>body</strong></p><script>alert(1)</script><img src=\"https://outside.test/evil.webp\" alt=\"outside\">" }, "application/json");
  const autosaveData = await autosave.json();
  assert.equal(autosave.status, 200, JSON.stringify(autosaveData));
  assert.match(autosaveData.content_html, /<h2>Editor heading<\/h2>/u);
  assert.doesNotMatch(autosaveData.content_html, /script|outside\.test/iu);
  const revisionAfterAutosave = Number((await connection.execute("SELECT COUNT(*) AS count FROM post_revisions WHERE post_id = ?", [createdPostId]))[0][0].count);
  assert.equal(revisionAfterAutosave, revisionBeforeAutosave, "autosave within five minutes must not add another revision");
  const [[readyPost]] = await connection.execute("SELECT slug, updated_at, content_html, content_text FROM posts WHERE id = ?", [createdPostId]);
  assert.doesNotMatch(readyPost.content_html, /script/iu);
  assert.match(readyPost.content_text, /Safe body/u);
  const publishResponse = await post(`/api/admin/posts/${createdPostId}/publish`, createdPostForm.cookies, createdPostForm.token, { expected_updated_at: sqlStamp(readyPost.updated_at) });
  assert.equal(publishResponse.status, 302);
  const ownerPreview = await get(`/aadmin/preview/${createdPostId}`, ownerCookie);
  assert.equal(ownerPreview.status, 200);
  const previewHtml = await ownerPreview.text();
  assert.match(previewHtml, /Preview/u);
  assert.doesNotMatch(previewHtml, /<script/iu);
  assert.equal((await get(`/aadmin/preview/${createdPostId}`, otherEditorCookie)).status, 404);
  assert.match(await (await get(`/aadmin?status=published&search=${encodeURIComponent("M3 Smoke Article")}`, ownerCookie)).text(), /M3 Smoke Article/u);
  assert.match(await (await get(`/aadmin?status=draft&search=${encodeURIComponent("M3 Smoke Article")}`, ownerCookie)).text(), /No posts found/u);
  const oldSlug = readyPost.slug;
  createdOldSlug = oldSlug;
  const editForm = await tokenFor(postPath, ownerCookie);
  const editorPage = await get(postPath, editForm.cookies);
  assert.equal(editorPage.status, 200);
  const editorHtml = await editorPage.text();
  assert.match(editorHtml, /data-read-only="false"/u, "owner must be able to edit a published post");
  assert.match(editorHtml, /data-image-size-toolbar/u);
  assert.match(editorHtml, /<details open class="editor-panel">\s*<summary>Publish/u);
  assert.match(editorHtml, /<details open class="editor-panel">\s*<summary>Category and tags/u);
  assert.match(editorHtml, /<summary>Blogger sync<\/summary>/u);
  const bloggerConnectionStatus = editorHtml.match(/Connected to blog \d+\.|Blogger account is not connected\./u)?.[0];
  assert.ok(bloggerConnectionStatus, "editor should show a real Blogger connection state");
  const editorReloadHtml = await (await get(postPath, editForm.cookies)).text();
  assert.ok(editorReloadHtml.includes(bloggerConnectionStatus), "Blogger connection state should persist after page reload");
  assert.match(editorHtml, /\/vendor\/quill\/quill\.js/u);
  assert.match(editorHtml, /data-feature="admin-post-editor"/u);
  assert.doesNotMatch(editorHtml, /<script(?![^>]*\bsrc=)/iu);
  assert.doesNotMatch(editorHtml, /ql-table/u);
  const [[publishedState]] = await connection.execute("SELECT slug, content_html, published_at, updated_at FROM posts WHERE id = ?", [createdPostId]);
  const blockedPublishedAutosave = await post(postPath, editForm.cookies, editForm.token, { ...firstSave, slug: publishedState.slug, expected_updated_at: sqlStamp(publishedState.updated_at), autosave: "1", content_html: "<p>Must not become public</p>" }, "application/json");
  const blockedPublishedData = await blockedPublishedAutosave.json();
  assert.equal(blockedPublishedAutosave.status, 409);
  assert.match(blockedPublishedData.error, /Autosave is unavailable/u);
  const [[unchangedPublished]] = await connection.execute("SELECT content_html FROM posts WHERE id = ?", [createdPostId]);
  assert.equal(unchangedPublished.content_html, publishedState.content_html);
  const correctedFields = { ...firstSave, title: "M3 Smoke Article Corrected", slug: publishedState.slug, expected_updated_at: sqlStamp(publishedState.updated_at) };
  const correctedPayload = buildPostPayload(correctedFields, { contentHtml: correctedFields.content_html, expectedUpdatedAt: correctedFields.expected_updated_at });
  const correctedSave = await post(postPath, editForm.cookies, editForm.token, correctedPayload);
  assert.equal(correctedSave.status, 302, await correctedSave.text());
  const [[correctedPost]] = await connection.execute("SELECT title, status, updated_at FROM posts WHERE id = ?", [createdPostId]);
  assert.equal(correctedPost.title, correctedFields.title);
  assert.equal(correctedPost.status, "published");
  const republish = await post(`/api/admin/posts/${createdPostId}/publish`, editForm.cookies, editForm.token, { expected_updated_at: sqlStamp(correctedPost.updated_at) });
  assert.equal(republish.status, 302);
  assert.equal(republish.headers.get("location"), "/aadmin?published=1");
  const [[republishedPost]] = await connection.execute("SELECT status, published_at, updated_at FROM posts WHERE id = ?", [createdPostId]);
  assert.equal(republishedPost.status, "published");
  assert.equal(republishedPost.published_at.toISOString(), publishedState.published_at.toISOString());
  const unconfirmedSlug = await post(postPath, editForm.cookies, editForm.token, { ...firstSave, expected_updated_at: sqlStamp(republishedPost.updated_at), slug: `${oldSlug}-unconfirmed` });
  assert.equal(unconfirmedSlug.status, 409);
  assert.match(await unconfirmedSlug.text(), /Confirm the published slug change/u);
  await connection.execute("INSERT INTO redirects (from_slug, to_slug) VALUES (?, ?)", [`older-${oldSlug}`, oldSlug]);
  const slugChange = { ...firstSave, expected_updated_at: sqlStamp(republishedPost.updated_at), slug: `${oldSlug}-renamed`, confirm_slug_change: "1" };
  assert.equal((await post(postPath, editForm.cookies, editForm.token, slugChange)).status, 302);
  const [[redirectRow]] = await connection.execute("SELECT to_slug FROM redirects WHERE from_slug = ?", [oldSlug]);
  assert.equal(redirectRow.to_slug, `${oldSlug}-renamed`);
  const [[olderRedirect]] = await connection.execute("SELECT to_slug FROM redirects WHERE from_slug = ?", [`older-${oldSlug}`]);
  assert.equal(olderRedirect.to_slug, `${oldSlug}-renamed`);
  const [[oldRevision]] = await connection.execute("SELECT id FROM post_revisions WHERE post_id = ? ORDER BY id ASC LIMIT 1", [createdPostId]);
  const [[beforeRestore]] = await connection.execute("SELECT updated_at FROM posts WHERE id = ?", [createdPostId]);
  const restore = await post(`/api/admin/posts/${createdPostId}/revisions/${oldRevision.id}/restore`, editForm.cookies, editForm.token, { expected_updated_at: sqlStamp(beforeRestore.updated_at) }, "application/json");
  const restoreData = await restore.json();
  assert.equal(restore.status, 200, JSON.stringify(restoreData));
  assert.equal(restoreData.title, "M3 Smoke Article");
  const [[restoreAudit]] = await connection.execute("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'post.restore_revision' AND entity_id = ?", [String(createdPostId)]);
  assert.equal(Number(restoreAudit.count), 1);
  const [[afterRestore]] = await connection.execute("SELECT updated_at, content_text FROM posts WHERE id = ?", [createdPostId]);
  assert.match(afterRestore.content_text, /Safe body/u);
  for (let index = 0; index < 51; index += 1) {
    await connection.execute("INSERT INTO post_revisions (post_id, title, content_html, edited_by) SELECT id, title, content_html, ? FROM posts WHERE id = ?", [ownerId, createdPostId]);
  }
  const retentionSave = await post(postPath, editForm.cookies, editForm.token, { ...slugChange, expected_updated_at: sqlStamp(afterRestore.updated_at) });
  assert.equal(retentionSave.status, 302);
  const [[revisionCount]] = await connection.execute("SELECT COUNT(*) AS count FROM post_revisions WHERE post_id = ?", [createdPostId]);
  assert.equal(Number(revisionCount.count), 50);
  const deleteCategory = await post(`/api/admin/categories/${createdCategoryId}/delete`, categoryForm.cookies, categoryForm.token, {});
  assert.equal(deleteCategory.status, 409);
  assert.match(await deleteCategory.text(), /post uses it/u);
  const [[actionRows]] = await connection.execute("SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'post' AND entity_id = ? AND action IN ('post.create','post.update','post.submit','post.reject','post.publish')", [String(createdPostId)]);
  assert.ok(Number(actionRows.count) >= 3);
  const [[postAuditActions]] = await connection.execute("SELECT COUNT(DISTINCT action) AS count FROM audit_log WHERE entity_type = 'post' AND entity_id = ?", [String(ownedEditorPost.id)]);
  assert.equal(Number(postAuditActions.count), 2);
  const draftDelete = await post(`/api/admin/posts/${ownedEditorPost.id}/delete`, editorPostForm.cookies, editorPostForm.token, { expected_updated_at: sqlStamp(returnedPost.updated_at) });
  assert.equal(draftDelete.status, 302);
  const [[deletedEditorPost]] = await connection.execute("SELECT deleted_at FROM posts WHERE id = ?", [ownedEditorPost.id]);
  assert.ok(deletedEditorPost.deleted_at);
  const paginationSlugs = Array.from({ length: 21 }, (_, index) => `m3-page-${Date.now()}-${index}`);
  for (const [index, slug] of paginationSlugs.entries()) {
    const [result] = await connection.execute("INSERT INTO posts (title, slug, author_id, created_by, status) VALUES (?, ?, ?, ?, 'draft')", [`M3Page ${String(index).padStart(2, "0")}`, slug, editorAuthorId, editorId]);
    pagePostIds.push(result.insertId);
  }
  const firstPageHtml = await (await get("/aadmin?status=draft&search=M3Page&page=1", editorCookie)).text();
  const secondPageHtml = await (await get("/aadmin?status=draft&search=M3Page&page=2", editorCookie)).text();
  assert.equal((firstPageHtml.match(/class="status-badge status-badge--draft"/gu) ?? []).length, 20);
  assert.equal((secondPageHtml.match(/class="status-badge status-badge--draft"/gu) ?? []).length, 1);
  for (const [cookie, scopedUserId] of [[ownerCookie, null], [editorCookie, editorId]]) {
    const dashboardHtml = await (await get("/aadmin", cookie)).text();
    const cardValues = [...dashboardHtml.matchAll(/<div class="post-stat"><span>[^<]+<\/span><strong>([^<]+)<\/strong>/gu)].map((match) => Number(match[1]));
    const [expected] = await connection.execute("SELECT SUM(status = 'published') AS published, SUM(status = 'in_review') AS in_review, SUM(status = 'draft') AS drafts FROM posts WHERE deleted_at IS NULL AND (? IS NULL OR created_by = ?)", [scopedUserId, scopedUserId]);
    const [[views]] = await connection.execute("SELECT COALESCE(SUM(v.views), 0) AS views FROM post_daily_views v JOIN posts p ON p.id = v.post_id WHERE v.day >= UTC_DATE() - INTERVAL 6 DAY AND p.deleted_at IS NULL AND (? IS NULL OR p.created_by = ?)", [scopedUserId, scopedUserId]);
    assert.deepEqual(cardValues, [Number(expected[0].published ?? 0), Number(expected[0].in_review ?? 0), Number(expected[0].drafts ?? 0), Number(views.views)]);
  }

  const authorsForm = await tokenFor("/aadmin/team/authors", ownerCookie);
  assert.equal((await post("/api/admin/authors/guest", authorsForm.cookies, authorsForm.token, { display_name: "M2 Smoke Guest", bio: "Guest", show_on_about: "1" })).status, 302);
  const [guestAuthors] = await connection.execute("SELECT id, show_on_about FROM authors WHERE display_name = ?", ["M2 Smoke Guest"]);
  guestAuthorId = guestAuthors[0].id;
  assert.equal(guestAuthors[0].show_on_about, 1);
  assert.equal((await post(`/api/admin/authors/${guestAuthorId}`, authorsForm.cookies, authorsForm.token, { display_name: "M2 Smoke Guest Edited", bio: "Edited", show_on_about: "0", avatar_media_id: String(editorAvatarMediaId) })).status, 302);
  const [[guestAvatar]] = await connection.execute("SELECT avatar_media_id FROM authors WHERE id = ?", [guestAuthorId]);
  assert.equal(Number(guestAvatar.avatar_media_id), editorAvatarMediaId);
  await connection.execute("UPDATE authors SET avatar_media_id = NULL WHERE id = ?", [guestAuthorId]);

  assert.equal((await post(`/api/admin/team/${editorId}/remove`, teamForm.cookies, teamForm.token, {})).status, 302);
  const [[smokePost]] = await connection.execute("SELECT author_id, created_by FROM posts WHERE slug = ?", [smokePostSlug]);
  const [ownerAuthorsAfter] = await connection.execute("SELECT id FROM authors WHERE user_id = ?", [ownerId]);
  assert.equal(Number(smokePost.author_id), Number(ownerAuthorsAfter[0].id));
  assert.equal(Number(smokePost.created_by), Number(ownerId));
  const [retainedAuthor] = await connection.execute("SELECT user_id FROM authors WHERE id = ?", [editorAuthorId]);
  assert.equal(retainedAuthor[0].user_id, null);

  const settingsForm = await tokenFor("/aadmin/settings", ownerCookie);
  const settingsHtml = await (await get("/aadmin/settings", ownerCookie)).text();
  for (const tab of ["general", "rules", "social", "ads", "blogger"]) { assert.match(settingsHtml, new RegExp(`id="${tab}"`)); }
  assert.equal((await post("/api/admin/settings", settingsForm.cookies, settingsForm.token, { siteName: "Smoke", tagline: "Smoke", contactEmail: "contact@example.test", submissionsEmail: "stories@example.test", businessName: "Smoke", address: "Smoke", timezone: "Asia/Colombo", footerBlurb: "Smoke", moderation: "first_time", closeAfterDays: "0" })).status, 302);
  const auditResponse = await get("/aadmin/audit?actor=&action=team.invite&from=01%2F01%2F2020&to=31%2F12%2F2035", ownerCookie);
  assert.equal(auditResponse.status, 200);
  const auditHtml = await auditResponse.text();
  assert.match(auditHtml, /team\.invite/u);
  assert.match(auditHtml, /Time \(Asia\/Colombo\)/u);
  assert.match(auditHtml, /From date/u);
  assert.match(auditHtml, /type="date" name="from"/u);
  assert.match(auditHtml, /type="date" name="to"/u);
  assert.match(auditHtml, /src="\/js\/main\.js"/u);
  assert.ok(auditHtml.includes("User: M2 Smoke Invited"));
  const authorAuditHtml = await (await get("/aadmin/audit?actor=&action=author.update&from=01%2F01%2F2020&to=31%2F12%2F2035", ownerCookie)).text();
  assert.ok(authorAuditHtml.includes("Author: M2 Smoke Guest Edited"));
  const removedUserAuditHtml = await (await get("/aadmin/audit?actor=&action=team.remove&from=01%2F01%2F2020&to=31%2F12%2F2035", ownerCookie)).text();
  assert.ok(removedUserAuditHtml.includes(`Removed user #${editorId}`));
  const teamWithLastSignIn = await (await get("/aadmin/team", ownerCookie)).text();
  assert.match(teamWithLastSignIn, /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/u);
  const [auditRows] = await connection.execute("SELECT action FROM audit_log WHERE id > ?", [auditMarker.id]);
  const auditActions = new Set(auditRows.map((row) => row.action));
  for (const action of ["team.invite", "team.disable", "team.enable", "team.remove", "settings.update", "author.create", "author.update"]) {
    assert.ok(auditActions.has(action), `missing audit action ${action}`);
  }
  for (const action of ["post.submit", "post.reject", "post.delete", "post.create", "post.update", "post.publish", "category.create", "category.update", "category.delete", "media.upload", "media.update", "media.delete"]) { assert.ok(auditActions.has(action), `missing audit action ${action}`); }
  process.stdout.write("Real-schema M3 admin and media smoke passed: roles, lifecycle, categories, dashboard, media uploads, image safety, picker, avatars, delete rules, settings and audit.\n");
});
