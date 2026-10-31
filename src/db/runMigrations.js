import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function runMigrations({
  connection,
  directory,
  migrationRepository,
}) {
  await migrationRepository.ensureMigrationsTable(connection);
  const appliedVersions = new Set(
    await migrationRepository.getAppliedMigrations(connection),
  );
  const fileNames = (await readdir(directory))
    .filter((fileName) => /^\d{3}_[a-z0-9_-]+\.sql$/.test(fileName))
    .sort();

  for (const fileName of fileNames) {
    if (appliedVersions.has(fileName)) {
      continue;
    }

    const sql = await readFile(path.join(directory, fileName), "utf8");
    await migrationRepository.executeMigration(connection, sql);
    await migrationRepository.recordMigration(connection, fileName);
    process.stdout.write(`Applied migration ${fileName}\n`);
  }

  return fileNames.length;
}
