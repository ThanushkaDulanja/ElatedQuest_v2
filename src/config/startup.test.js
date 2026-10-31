import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const serverFile = path.join(projectDirectory, "server.js");

function testEnvironment() {
  return {
    NODE_ENV: "test",
    PORT: "0",
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

function safeChildEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => {
      return ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"].includes(
        name.toUpperCase(),
      );
    }),
  );
}

function serializeDotEnv(source) {
  return Object.entries(source)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n");
}

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out. ${stderr}`));
    }, 10_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (
        stdout.includes("ElatedQuest server listening on http://127.0.0.1:")
      ) {
        clearTimeout(timeout);
        resolve(stdout);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code}. ${stderr}`));
    });
  });
}

test("server starts from a valid .env without printing configured secrets", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "elatedquest-start-"));
  const environment = safeChildEnvironment();
  try {
    await writeFile(
      path.join(directory, ".env"),
      serializeDotEnv(testEnvironment()),
    );
    const child = spawn(process.execPath, [serverFile], {
      cwd: directory,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ready = await waitForServerReady(child);
    assert.match(
      ready,
      /ElatedQuest server listening on http:\/\/127\.0\.0\.1:\d+/,
    );
    assert.equal(ready.includes("test_password"), false);
    child.kill();
    await once(child, "exit");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("server exits with a clear missing-variable message when .env is incomplete", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "elatedquest-missing-env-"),
  );
  try {
    const environment = testEnvironment();
    delete environment.DB_PASSWORD;
    await writeFile(path.join(directory, ".env"), serializeDotEnv(environment));
    const child = spawn(process.execPath, [serverFile], {
      cwd: directory,
      env: safeChildEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    const [code] = await once(child, "exit");

    assert.notEqual(code, 0);
    assert.match(output, /Missing required environment variables: DB_PASSWORD/);
    assert.equal(output.includes("test_password"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
