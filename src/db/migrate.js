import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { databaseConfig } from "./pool.js";
import * as repository from "./repository.js";
import { runMigrations } from "./runMigrations.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(currentDirectory, "migrations");

async function main() {
  const connection = await mysql.createConnection({
    ...databaseConfig,
    multipleStatements: true,
  });

  try {
    const migrationCount = await runMigrations({
      connection,
      directory: migrationsDirectory,
      migrationRepository: repository,
    });
    process.stdout.write(
      `Migrations complete (${migrationCount} file(s) found).\n`,
    );
  } finally {
    await connection.end();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`Migration failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
