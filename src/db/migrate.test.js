import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runMigrations } from "./runMigrations.js";

test("migration runner applies the initial schema and subsequent migrations once", async () => {
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
  const authorsMigration = await readFile(
    path.join(migrationDirectory, "002_authors_show_on_about.sql"),
    "utf8",
  );
  const pageDefaultsMigration = await readFile(
    path.join(migrationDirectory, "003_public_page_defaults.sql"),
    "utf8",
  );
  const expectedMigrationSql = schema.replace(
    /CREATE DATABASE IF NOT EXISTS elatedquest\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\r?\nUSE elatedquest;\r?\n/,
    "",
  ).replace(/  show_on_about\s+TINYINT\(1\)\s+NOT NULL DEFAULT 0,\r?\n/, "");
  assert.equal(migrationSql, expectedMigrationSql);
  assert.match(authorsMigration, /information_schema\.columns/u);
  assert.match(authorsMigration, /ALTER TABLE authors ADD COLUMN show_on_about/u);
  assert.match(pageDefaultsMigration, /WHERE slug = 'privacy-policy'/u);
  assert.match(pageDefaultsMigration, /content_html =/u);
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

  assert.equal(executed.length, 3);
  assert.deepEqual([...applied], ["001_init.sql", "002_authors_show_on_about.sql", "003_public_page_defaults.sql"]);
});
