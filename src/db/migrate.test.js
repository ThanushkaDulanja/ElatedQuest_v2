import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runMigrations } from "./runMigrations.js";

test("migration runner applies each migration once and preserves all 24 table definitions", async () => {
  const root = process.cwd();
  const migrationDirectory = path.join(root, "src", "db", "migrations");
  const schema = await readFile(
    path.join(root, "database", "schema.sql"),
    "utf8",
  );
  const migrationSql = await readFile(
    path.join(migrationDirectory, "001_init.sql"),
    "utf8",
  );
  const expectedMigrationSql = schema.replace(
    /CREATE DATABASE IF NOT EXISTS elatedquest\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\r?\nUSE elatedquest;\r?\n/,
    "",
  );
  assert.equal(migrationSql, expectedMigrationSql);
  assert.equal(
    (migrationSql.match(/^CREATE TABLE IF NOT EXISTS /gm) ?? []).length,
    24,
  );

  const applied = new Set();
  const executed = [];
  const migrationRepository = {
    async ensureMigrationsTable() {},
    async getAppliedMigrations() {
      return [...applied];
    },
    async executeMigration(_connection, sql) {
      executed.push(sql);
    },
    async recordMigration(_connection, version) {
      applied.add(version);
    },
  };
  const connection = {};

  await runMigrations({
    connection,
    directory: migrationDirectory,
    migrationRepository,
  });
  await runMigrations({
    connection,
    directory: migrationDirectory,
    migrationRepository,
  });

  assert.equal(executed.length, 1);
  assert.deepEqual([...applied], ["001_init.sql"]);
});
