import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import express from "express";
import { chromium } from "playwright";

const projectRoot = path.resolve(".");

test("Sentry browser import map points only to vendored first-party SDK files", async () => {
  const partial = await readFile(path.join(projectRoot, "src/views/partials/sentry.njk"), "utf8");
  const serialized = partial.match(/<script type="importmap"[^>]*>(\{.*\})<\/script>/u)?.[1];
  assert.ok(serialized, "Sentry import map exists");
  const { imports } = JSON.parse(serialized);
  for (const target of Object.values(imports)) {
    assert.ok(target.startsWith("/vendor/sentry/"), `expected first-party Sentry file: ${target}`);
    const pathname = target.endsWith("/") ? `${target}index.js` : target;
    await assert.doesNotReject(readFile(path.join(projectRoot, "public", pathname.slice(1))));
  }
  assert.match(partial, /\{% if sentryDsn %\}/u);
  assert.match(await readFile(path.join(projectRoot, "public/js/sentry-init.js"), "utf8"), /sendDefaultPii: false/u);
});

test("vendored Sentry browser SDK loads and captures browser exceptions", async (context) => {
  const partial = await readFile(path.join(projectRoot, "src/views/partials/sentry.njk"), "utf8");
  const imports = JSON.parse(partial.match(/<script type="importmap"[^>]*>(\{.*\})<\/script>/u)[1]).imports;
  const app = express();
  app.get("/", (_request, response) => response.type("html").send(`<meta name="sentry-dsn" content="https://public-key@errors.example.test/42"><script type="importmap">${JSON.stringify({ imports })}</script><script type="module" src="/js/sentry-init.js"></script>`));
  app.use(express.static(path.join(projectRoot, "public")));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForTimeout(100);
  const sdkState = await page.evaluate(async () => { const Sentry = await import("@sentry/browser"); return { ready: Sentry.isInitialized(), dsn: Sentry.getClient()?.getOptions().dsn }; });
  assert.equal(sdkState.ready, true, `Sentry SDK should initialize; browser errors: ${pageErrors.join("; ")}`);
  const eventId = await page.evaluate(async () => { const Sentry = await import("@sentry/browser"); return Sentry.captureException(new Error("Sentry browser smoke event")); });
  assert.match(eventId, /^[a-f0-9-]{32,36}$/u);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
