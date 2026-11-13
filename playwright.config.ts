import { defineConfig } from "@playwright/test";

const baseURL = process.env.PW_BASE_URL ?? "http://127.0.0.1:3001";
const externalTarget = Boolean(process.env.PW_BASE_URL);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  expect: { timeout: 5_000 },
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(externalTarget
    ? {}
    : {
        webServer: {
          command: "npm start",
          url: `${baseURL}/api/health`,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      }),
});
