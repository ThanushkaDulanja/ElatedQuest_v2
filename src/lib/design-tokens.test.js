import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseCss = await readFile(path.join(projectRoot, "public/css/base.css"), "utf8");
const tokens = new Map([...baseCss.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/giu)].map((match) => [match[1], match[2]]));

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/gu).map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

test("admin text and status token pairs meet WCAG AA contrast", () => {
  const pairs = [
    ["color-ink", "color-paper"], ["color-ink", "color-surface"],
    ["color-muted", "color-paper"], ["color-primary-text", "color-primary"],
    ["color-link", "color-paper"], ["color-danger", "color-paper"],
    ["color-success", "color-paper"],
    ["color-status-draft-text", "color-status-draft-bg"],
    ["color-status-review-text", "color-status-review-bg"],
    ["color-status-published-text", "color-status-published-bg"],
    ["color-status-archived-text", "color-status-archived-bg"],
    ["color-status-active-text", "color-status-active-bg"],
    ["color-status-invited-text", "color-status-invited-bg"],
    ["color-status-disabled-text", "color-status-disabled-bg"],
    ["color-status-pending-text", "color-status-pending-bg"],
    ["color-status-approved-text", "color-status-approved-bg"],
    ["color-status-spam-text", "color-status-spam-bg"],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(tokens.has(foreground), `Missing color token --${foreground}`);
    assert.ok(tokens.has(background), `Missing color token --${background}`);
    const ratio = contrastRatio(tokens.get(foreground), tokens.get(background));
    assert.ok(ratio >= 4.5, `--${foreground} on --${background} has contrast ${ratio.toFixed(2)}:1`);
  }
});
