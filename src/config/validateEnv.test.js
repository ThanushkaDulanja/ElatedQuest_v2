import assert from "node:assert/strict";
import test from "node:test";
import { validateEnv } from "./validateEnv.js";

function validEnvironment() {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    SITE_URL: "http://localhost:3000",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USER: "test_user",
    DB_PASSWORD: "test_password",
    DB_NAME: "elatedquest_test",
    SESSION_SECRET: "test_session_secret",
    HASH_SECRET: "test_hash_secret",
    OWNER_EMAIL: "owner@example.test",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "test-smtp-user",
    SMTP_PASS: "test-smtp-pass",
    EMAIL_FROM: "ElatedQuest <noreply@example.test>",
    SUBMISSIONS_EMAIL: "stories@example.test",
    CONTACT_EMAIL: "contact@example.test",
    ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    UPLOAD_DIR: "./uploads",
    UPLOADS_PUBLIC_URL: "http://localhost:3000/uploads",
  };
}

test("validates required environment settings without exposing their values", () => {
  const result = validateEnv(validEnvironment());
  assert.equal(result.port, 3000);
  assert.equal(result.database.name, "elatedquest_test");
  assert.equal(result.database.password, "test_password");
  assert.equal(result.encryptionKey.length, 32);
});

test("fails with a clear list when a required environment value is absent", () => {
  const environment = validEnvironment();
  delete environment.DB_PASSWORD;

  assert.throws(() => validateEnv(environment), {
    message: /Missing required environment variables: DB_PASSWORD/,
  });
});

test("rejects a malformed database port and encryption key", () => {
  const environment = validEnvironment();
  environment.DB_PORT = "mysql";
  assert.throws(() => validateEnv(environment), /DB_PORT must be an integer/);

  environment.DB_PORT = "3306";
  environment.ENCRYPTION_KEY = "not-a-key";
  assert.throws(() => validateEnv(environment), /32-byte key/);
});
