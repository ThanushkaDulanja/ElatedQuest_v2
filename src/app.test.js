import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3000";
process.env.SITE_URL ??= "http://localhost:3000";
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "test_user";
process.env.DB_PASSWORD ??= "test_password";
process.env.DB_NAME ??= "elatedquest_test";
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
  assert.doesNotMatch(html, /password|forgot password|registration/i);

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
