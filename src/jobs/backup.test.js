import assert from "node:assert/strict";
import test from "node:test";
import { createCipheriv, randomBytes } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { backupName, copyUploadsSnapshot, decryptBackupToSql, monthlyBackupName, pruneBackups } from "./backup.js";

test("backup names are stable daily and monthly UTC names", () => {
  const date = new Date("2026-11-01T00:00:00Z");
  assert.equal(backupName(date), "2026-11-01.sql.gz.enc");
  assert.equal(monthlyBackupName(date), "monthly-2026-11.sql.gz.enc");
});

test("encrypted compressed backups decrypt and reject tampering", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eq-backup-test-"));
  const source = path.join(directory, "source.sql");
  const encrypted = path.join(directory, "backup.enc");
  const decrypted = path.join(directory, "decrypted.sql");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  await writeFile(source, "CREATE TABLE safe (id INT);\n");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await writeFile(encrypted, Buffer.concat([Buffer.from("EQBK1"), iv]));
  await pipeline(createReadStream(source), createGzip(), cipher, createWriteStream(encrypted, { flags: "a" }));
  await appendFile(encrypted, cipher.getAuthTag());
  await decryptBackupToSql(encrypted, decrypted, key);
  assert.equal(await readFile(decrypted, "utf8"), "CREATE TABLE safe (id INT);\n");
  const bytes = await readFile(encrypted);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(encrypted, bytes);
  await assert.rejects(decryptBackupToSql(encrypted, path.join(directory, "bad.sql"), key));
  await rm(directory, { recursive: true, force: true });
});

test("backup retention keeps newest daily and monthly copies", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eq-prune-test-"));
  for (const name of ["2026-11-01.sql.gz.enc", "2026-11-02.sql.gz.enc", "2026-11-03.sql.gz.enc", "monthly-2026-09.sql.gz.enc", "monthly-2026-10.sql.gz.enc", "notes.txt"]) { await writeFile(path.join(directory, name), "x"); }
  assert.equal(await pruneBackups(directory, { dailyKeep: 2, monthlyKeep: 1 }), 2);
  await assert.rejects(readFile(path.join(directory, "2026-11-01.sql.gz.enc")));
  await assert.rejects(readFile(path.join(directory, "monthly-2026-09.sql.gz.enc")));
  assert.equal((await readFile(path.join(directory, "notes.txt"))).toString(), "x");
  await rm(directory, { recursive: true, force: true });
});

test("uploads are copied to dated secondary snapshots", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eq-media-backup-test-"));
  const source = path.join(directory, "uploads");
  const destination = path.join(directory, "backup-store");
  await mkdir(source);
  await writeFile(path.join(source, "cover.webp"), "image");
  const snapshot = await copyUploadsSnapshot(source, destination, new Date("2026-11-09T00:00:00Z"));
  assert.equal(await readFile(path.join(snapshot, "cover.webp"), "utf8"), "image");
  await rm(directory, { recursive: true, force: true });
});
