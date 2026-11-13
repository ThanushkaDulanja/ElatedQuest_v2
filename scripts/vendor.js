import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "quill", "dist");
const target = join(root, "public", "vendor", "quill");
await mkdir(target, { recursive: true });
for (const file of ["quill.js", "quill.js.LICENSE.txt", "quill.snow.css"]) {
  const sourceFile = join(source, file);
  const targetFile = join(target, file);
  let unchanged = false;
  try { unchanged = (await readFile(sourceFile)).equals(await readFile(targetFile)); } catch { /* Copy missing vendor files. */ }
  if (!unchanged) { await cp(sourceFile, targetFile); }
}
const sentryRoot = join(root, "node_modules", "@sentry");
const sentryTarget = join(root, "public", "vendor", "sentry", "@sentry");
const sentryPackages = [
  ["browser", "build/npm/esm/prod"],
  ["browser-utils", "build/esm"],
  ["core", "build/esm"],
  ["feedback", "build/npm/esm"],
  ["replay", "build/npm/esm"],
  ["replay-canvas", "build/npm/esm"],
];
for (const [name, buildPath] of sentryPackages) {
  const packageRoot = join(sentryRoot, name);
  await mkdir(join(sentryTarget, name), { recursive: true });
  await cp(join(packageRoot, buildPath), join(sentryTarget, name, "build"), { recursive: true });
  await cp(join(packageRoot, "LICENSE"), join(sentryTarget, name, "LICENSE"));
}
await mkdir(join(sentryTarget, "conventions"), { recursive: true });
await cp(join(sentryRoot, "conventions", "dist"), join(sentryTarget, "conventions", "dist"), { recursive: true });
await cp(join(sentryRoot, "conventions", "LICENSE"), join(sentryTarget, "conventions", "LICENSE"));
const webVitalsRoot = join(root, "node_modules", "web-vitals");
await mkdir(join(root, "public", "vendor", "sentry", "web-vitals"), { recursive: true });
await cp(join(webVitalsRoot, "dist"), join(root, "public", "vendor", "sentry", "web-vitals", "dist"), { recursive: true });
await cp(join(webVitalsRoot, "LICENSE"), join(root, "public", "vendor", "sentry", "web-vitals", "LICENSE"));
await cp(join(root, "src", "lib", "sentry-scrub.js"), join(root, "public", "js", "sentry-scrub.js"));
console.log("Vendored Quill and Sentry browser SDK into public/vendor/.");
