import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cssDirectory = path.join(projectDirectory, "public", "css");
const sourceFiles = ["base.css", "layout.css"];

for (const subdirectory of ["components", "pages"]) {
  const directory = path.join(cssDirectory, subdirectory);
  const files = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".css") && !fileName.startsWith("public-"))
    .sort();
  sourceFiles.push(
    ...files.map((fileName) => path.join(subdirectory, fileName)),
  );
}

sourceFiles.push("admin.css");

const contents = await Promise.all(
  sourceFiles.map((fileName) =>
    readFile(path.join(cssDirectory, fileName), "utf8"),
  ),
);
await writeFile(
  path.join(cssDirectory, "site.css"),
  `${contents.join("\n")}\n`,
);
const publicFiles = ["base.css"];
for (const subdirectory of ["components", "pages"]) {
  const directory = path.join(cssDirectory, subdirectory);
  const files = (await readdir(directory))
    .filter((fileName) => fileName.startsWith("public-") && fileName.endsWith(".css"))
    .sort();
  publicFiles.push(...files.map((fileName) => path.join(subdirectory, fileName)));
}
const publicContents = await Promise.all(publicFiles.map((fileName) => readFile(path.join(cssDirectory, fileName), "utf8")));
await writeFile(path.join(cssDirectory, "public-site.css"), `${publicContents.join("\n")}\n`);
process.stdout.write(
  `Built public/css/site.css from ${sourceFiles.length} source file(s) and public-site.css from ${publicFiles.length} public-only source file(s).\n`,
);
