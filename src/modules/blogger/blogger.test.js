import assert from "node:assert/strict";
import test from "node:test";
import { createBloggerService } from "./service.js";
import { decryptRefreshToken, encryptRefreshToken } from "./crypto.js";
import { createBloggerRepository } from "./repository.js";

const key = Buffer.alloc(32, 7);

function syncFixture({ existingId = null, result = { id: "blogger-1", url: "https://blogger.example/post" }, apiError = null, searchResult = [], disconnected = false } = {}) {
  const calls = [];
  const rows = { connection: { blog_id: "blog-1", refresh_token_encrypted: encryptRefreshToken("refresh", key), needs_reconnect: 0 }, post: { id: 9, title: "Title", slug: "title", content_html: "<p>Body</p>", status: "published", blogger_post_id: existingId, blogger_sync_status: "none", category_name: "News", labels: ["News"] } };
  if (disconnected) { rows.connection = null; }
  const repository = {
    async connection() { return rows.connection; },
    async postForSync() { return rows.post; },
    async claimPost() { return { pending: false, bloggerPostId: rows.post.blogger_post_id }; },
    async completePost(id, post) { calls.push(["complete", id, post]); },
    async failPost(id, message) { calls.push(["failed", id, message]); },
    async needsReconnect() { calls.push(["reconnect"]); },
  };
  const oauthClientFactory = () => ({
    setCredentials(credentials) { calls.push(["credentials", credentials]); },
    async request(request) { calls.push(["request", request]); if (apiError) { throw apiError; } if (request.method === "POST" || request.method === "PUT") { return { data: result }; } return { data: { items: searchResult } }; },
  });
  return { service: createBloggerService({ repository, encryptionKey: key, siteUrl: "https://site.example", oauthClientFactory }), calls };
}

test("refresh token encryption authenticates stored tokens", () => {
  const encrypted = encryptRefreshToken("refresh-token", key);
  assert.notEqual(encrypted, encryptRefreshToken("refresh-token", key));
  assert.equal(decryptRefreshToken(encrypted, key), "refresh-token");
  assert.throws(() => decryptRefreshToken(encrypted, Buffer.alloc(32, 8)));
});

test("OAuth uses offline access, validates state, and persists an encrypted Blogger connection", async () => {
  const calls = [];
  const saved = [];
  const repository = { async connection() { return null; }, async saveConnection(...values) { saved.push(values); }, async audit() {} };
  const oauthClientFactory = () => ({
    generateAuthUrl(options) { calls.push(["auth", options]); return "https://accounts.google.com/authorize"; },
    async getToken(code) { calls.push(["token", code]); return { tokens: { refresh_token: "google-refresh-token" } }; },
    setCredentials(value) { calls.push(["credentials", value]); },
    async request() { return { data: { items: [{ id: "blog-7", name: "My blog", url: "https://blog.example" }] } }; },
  });
  const service = createBloggerService({ repository, encryptionKey: key, clientId: "client", clientSecret: "secret", redirectUri: "https://site.example/callback", siteUrl: "https://site.example", oauthClientFactory });
  const request = { session: {}, query: {}, user: { id: 4 }, ip: "127.0.0.1" };
  assert.equal(await service.startAuthorization(request), "https://accounts.google.com/authorize");
  const options = calls.find(([kind]) => kind === "auth")[1];
  assert.equal(options.access_type, "offline");
  assert.equal(options.prompt, "select_account consent");
  request.query = { code: "auth-code", state: options.state };
  assert.deepEqual(await service.finishAuthorization(request), [{ id: "blog-7", name: "My blog", url: "https://blog.example" }]);
  await service.finishConnection("blog-7", request);
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], "blog-7");
  assert.equal(decryptRefreshToken(saved[0][1], key), "google-refresh-token");
  assert.equal(saved[0][2], 4);
});

test("generated Google authorization URL uses the exact Blogger callback URI", async () => {
  const service = createBloggerService({ repository: {}, encryptionKey: key, clientId: "client-id", clientSecret: "client-secret", redirectUri: "http://localhost:3000/api/admin/blogger/callback", siteUrl: "http://localhost:3000" });
  const url = new URL(await service.startAuthorization({ session: {} }));
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/admin/blogger/callback");
});

test("sync creates a Blogger post, stores its association, and reports success", async () => {
  const { service, calls } = syncFixture();
  assert.deepEqual(await service.syncPost(9), { status: "synced", url: "https://blogger.example/post" });
  const request = calls.find(([kind, value]) => kind === "request" && value.method === "POST")[1];
  assert.equal(request.data.title, "Title");
  assert.match(request.data.content, /elatedquest-post:9/);
  assert.ok(calls.some(([kind, id]) => kind === "complete" && id === 9));
});

test("sync updates an existing Blogger association instead of inserting", async () => {
  const { service, calls } = syncFixture({ existingId: "existing" });
  await service.syncPost(9);
  assert.ok(calls.some(([kind, request]) => kind === "request" && request.method === "PUT" && request.url.endsWith("/existing")));
  assert.ok(!calls.some(([kind, request]) => kind === "request" && request.method === "POST"));
});

test("sync recovers a previously created post by its marker before inserting", async () => {
  const { service, calls } = syncFixture({ searchResult: [{ id: "recovered" , content: "<!-- elatedquest-post:9 -->" }] });
  await service.syncPost(9);
  assert.ok(calls.some(([kind, request]) => kind === "request" && request.method === "PUT" && request.url.endsWith("/recovered")));
  assert.ok(!calls.some(([kind, request]) => kind === "request" && request.method === "POST"));
  assert.ok(calls.some(([kind, request]) => kind === "request" && request.url.endsWith("/posts/search") && request.params.q === "elatedquest-post:9"));
});

test("sync records an API failure and never reports success", async () => {
  const { service, calls } = syncFixture({ apiError: Object.assign(new Error("denied"), { response: { status: 403 } }) });
  assert.deepEqual(await service.syncPost(9), { status: "failed", message: "Google denied Blogger access. Check Blogger API access and the selected blog permissions." });
  assert.ok(calls.some(([kind, , message]) => kind === "failed" && /Google denied/u.test(message)));
});

test("invalid_grant marks Blogger for reconnect and stops the retry queue", async () => {
  const { service, calls } = syncFixture({ apiError: Object.assign(new Error("invalid_grant"), { response: { status: 400, data: { error: "invalid_grant" } } }) });
  const result = await service.syncPost(9);
  assert.equal(result.message, "Google authorization expired. Reconnect Blogger.");
  assert.ok(calls.some(([kind]) => kind === "reconnect"));
});

test("a disconnected account does not issue a Blogger API request", async () => {
  const { service, calls } = syncFixture({ disconnected: true });
  const status = await service.syncPost(9);
  assert.equal(status.status, "not_connected");
  assert.equal(calls.filter(([kind]) => kind === "request").length, 0);
});

test("repository holds a per-post database lock through completion and releases it", async () => {
  const events = [];
  const connection = {
    async execute(sql, parameters) {
      events.push([sql, parameters]);
      if (sql.includes("GET_LOCK")) { return [[{ acquired: 1 }]]; }
      if (sql.includes("SELECT id, status")) { return [[{ id: 9, status: "published", blogger_post_id: null }]]; }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { events.push(["begin"]); },
    async commit() { events.push(["commit"]); },
    async rollback() { events.push(["rollback"]); },
    release() { events.push(["release"]); },
  };
  const repository = createBloggerRepository({ async getConnection() { return connection; }, async execute(...args) { return connection.execute(...args); } });
  const claim = await repository.claimPost(9);
  assert.deepEqual(claim, { pending: false, bloggerPostId: null });
  assert.equal(events.filter(([name]) => name === "release").length, 0);
  await repository.completePost(9, { id: "remote-9", url: "https://blogger.example/9" });
  assert.equal(events.some(([sql]) => sql.includes("RELEASE_LOCK")), true);
  assert.equal(events.filter(([name]) => name === "release").length, 1);
  assert.equal(events.some(([sql]) => sql.includes("blogger_sync_started_at")), false);
});

test("repository reports an active sync without stealing its database lock", async () => {
  let released = 0;
  const connection = {
    async execute(sql) { if (sql.includes("GET_LOCK")) { return [[{ acquired: 0 }]]; } throw new Error("Post query should not run while another sync owns the lock."); },
    release() { released += 1; },
  };
  const repository = createBloggerRepository({ async getConnection() { return connection; } });
  assert.deepEqual(await repository.claimPost(9), { pending: true });
  assert.equal(released, 1);
});
