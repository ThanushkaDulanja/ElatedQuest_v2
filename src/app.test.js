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
