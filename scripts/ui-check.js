import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  process.stderr.write("Playwright is not installed. Network access to the npm registry is unavailable in this environment; install Playwright and a browser when network access is available, then rerun npm run test:ui.\n");
  process.exit(2);
}

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectDirectory, "docs", "qa");
const baseUrl = process.env.SITE_URL ?? "http://localhost:3000";
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true }).catch(() => chromium.launch({ headless: true }));

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const cssResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/css/public-site.css");
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  if (!response?.ok()) { throw new Error(`Homepage returned ${response?.status() ?? "no response"}`); }
  const cssResponse = await cssResponsePromise;
  if (cssResponse.status() !== 200) { throw new Error(`Public CSS returned ${cssResponse.status()}`); }
  await page.screenshot({ path: path.join(outputDirectory, "home-1280.png"), fullPage: true });

  const desktop = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const sidebar = rect(".public-sidebar");
    const frame = rect(".public-home-frame");
    const top = rect(".public-home-top");
    const lead = rect(".public-home-lead");
    const leadImage = rect(".public-home-lead__image-link img, .public-home-lead__image-link .public-card__placeholder");
    const compactImage = rect(".public-home-mini__image-link img, .public-home-mini__image-link .public-card__placeholder");
    const latestCard = rect(".public-home-card");
    const latestImage = rect(".public-home-card__image-link img, .public-home-card__image-link .public-card__placeholder");
    const title = rect(".public-home-card__body h3");
    const category = rect(".public-home-card__category");
    const sections = [...document.querySelectorAll(".public-home-featured, .public-popular-mobile, #latest-heading")]
      .map((element) => element.matches("#latest-heading") ? "Latest articles" : element.matches(".public-popular-mobile") ? "Popular posts" : "Featured stories");
    const cardChildren = [...document.querySelector(".public-home-card__meta")?.children ?? []].map((element) => element.className);
    return {
      frameWidth: frame?.width,
      innerWidth: top?.width,
      sidebarWidth: sidebar?.width,
      leadWidth: lead?.width,
      leadImageHeight: leadImage?.height,
      miniImage: compactImage ? { width: compactImage.width, height: compactImage.height } : null,
      latestCardWidth: latestCard?.width,
      latestImage: latestImage ? { width: latestImage.width, height: latestImage.height } : null,
      latestColumnCount: getComputedStyle(document.querySelector(".public-story-list")).gridTemplateColumns.split(" ").length,
      categoryAfterTitle: Boolean(title && category && category.top >= title.bottom),
      cardChildren,
      sectionText: sections,
      hasSecondPage: Boolean(document.querySelector('.public-pagination a[href*="page=2"]')),
    };
  });
  const assertRange = (label, value, target, tolerance) => {
    if (typeof value !== "number" || Math.abs(value - target) > tolerance) {
      throw new Error(`${label}: expected ${target} ± ${tolerance}, got ${value}`);
    }
  };
  assertRange("Homepage shell width", desktop.frameWidth, 1164, 2);
  assertRange("Homepage inner width", desktop.innerWidth, 1068, 2);
  assertRange("Sidebar width", desktop.sidebarWidth, 324, 2);
  assertRange("Lead card width", desktop.leadWidth, 324, 2);
  assertRange("Lead image height", desktop.leadImageHeight, 163, 2);
  assertRange("Compact image width", desktop.miniImage?.width, 96, 1);
  assertRange("Compact image height", desktop.miniImage?.height, 68, 1);
  assertRange("Latest card width", desktop.latestCardWidth, 329.33, 2);
  assertRange("Latest image height", desktop.latestImage?.height, 164.67, 2);
  if (desktop.latestColumnCount !== 3) { throw new Error(`Expected three latest-card columns, got ${desktop.latestColumnCount}`); }
  if (!desktop.categoryAfterTitle) { throw new Error("Category badge must appear below its title"); }
  if (desktop.sectionText[0] !== "Featured stories" || desktop.sectionText.at(-1) !== "Latest articles" || desktop.sectionText.filter((text) => text === "Popular posts").length > 1) {
    throw new Error(`Homepage sections are out of order: ${desktop.sectionText.join(" → ")}`);
  }
  const pageTwo = await page.request.get(new URL("/?page=2", baseUrl).href);
  if (pageTwo.ok() && !desktop.hasSecondPage) { throw new Error('A second page exists but its "Load more stories" link is missing'); }
  process.stdout.write(`Public CSS status: ${cssResponse.status()}\n1280px measurements: ${JSON.stringify(desktop)}\n`);

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
    await page.reload({ waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) { throw new Error(`Horizontal scroll detected at ${width}px`); }
    if (width === 375) { await page.screenshot({ path: path.join(outputDirectory, "home-375.png"), fullPage: true }); }
    process.stdout.write(`${width}px horizontal overflow: none\n`);
  }
  process.stdout.write("UI checks passed. Screenshots saved to docs/qa/home-1280.png and docs/qa/home-375.png.\n");
} finally {
  await browser.close();
}
