import "../config/env.js";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import { appendFile, cp, copyFile, mkdir, open, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import { env } from "../config/env.js";

export function backupName(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}.sql.gz.enc`;
}

export function monthlyBackupName(date = new Date()) {
  return `monthly-${date.toISOString().slice(0, 7)}.sql.gz.enc`;
}

export async function pruneBackups(directory, { dailyKeep = 30, monthlyKeep = 12 } = {}) {
  const files = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const daily = files.filter((name) => /^\d{4}-\d{2}-\d{2}\.sql\.gz\.enc$/u.test(name)).sort().reverse();
  const monthly = files.filter((name) => /^monthly-\d{4}-\d{2}\.sql\.gz\.enc$/u.test(name)).sort().reverse();
  const expired = [...daily.slice(dailyKeep), ...monthly.slice(monthlyKeep)];
  await Promise.all(expired.map((name) => rm(path.join(directory, name), { force: true })));
  return expired.length;
}

export async function copyUploadsSnapshot(sourceDirectory, secondaryDirectory, date = new Date(), keep = 30) {
  const imageRoot = path.join(secondaryDirectory, "images");
  await mkdir(imageRoot, { recursive: true });
  const stamp = date.toISOString().slice(0, 10);
  await cp(sourceDirectory, path.join(imageRoot, stamp), { recursive: true, force: true, errorOnExist: false });
  const snapshots = (await readdir(imageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(snapshots.slice(keep).map((name) => rm(path.join(imageRoot, name), { recursive: true, force: true })));
  return path.join(imageRoot, stamp);
}

export async function decryptBackupToSql(backupPath, sqlPath, key = env.encryptionKey) {
  const handle = await open(backupPath, "r");
  try {
    const info = await handle.stat();
    if (info.size < 33) { throw new Error("Backup file is incomplete."); }
    const header = Buffer.alloc(17);
    const footer = Buffer.alloc(16);
    await handle.read(header, 0, header.length, 0);
    await handle.read(footer, 0, footer.length, info.size - footer.length);
    if (header.subarray(0, 5).toString() !== "EQBK1") { throw new Error("Unsupported backup format."); }
    const decryptor = createDecipheriv("aes-256-gcm", key, header.subarray(5));
    decryptor.setAuthTag(footer);
    await pipeline(createReadStream(backupPath, { start: 17, end: info.size - 17 }), decryptor, createGunzip(), createWriteStream(sqlPath, { flags: "wx" }));
  } finally {
    await handle.close();
  }
}

async function encryptedDump(directory, filename) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, filename);
  const temporary = `${target}.partial`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.encryptionKey, iv);
  const header = Buffer.concat([Buffer.from("EQBK1"), iv]);
  await rm(temporary, { force: true });
  await writeFile(temporary, header, { flag: "wx" });
  const child = spawn("mysqldump", ["--single-transaction", "--quick", "--routines", "--triggers", "--host", env.database.host, "--port", String(env.database.port), "--user", env.database.user, env.database.name], {
    env: { ...process.env, MYSQL_PWD: env.database.password },
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  const exited = once(child, "close");
  const stream = Readable.from((async function* () { yield* child.stdout; })());
  try {
    await pipeline(stream, createGzip(), cipher, createWriteStream(temporary, { flags: "a" }));
    const [code] = await exited;
    if (code !== 0) { throw new Error("Database dump command failed."); }
    await appendFile(temporary, cipher.getAuthTag());
    await rm(target, { force: true });
    const { rename } = await import("node:fs/promises");
    await rename(temporary, target);
    return target;
  } catch (error) {
    child.kill();
    await rm(temporary, { force: true });
    if (error.code === "ENOENT") { throw new Error("mysqldump is unavailable; install MySQL client tools on the worker."); }
    throw error;
  }
}

export async function runBackup({ date = new Date(), backupDirectory = env.backupDirectory, secondaryDirectory = env.backupSecondaryDirectory } = {}) {
  if (!secondaryDirectory) { throw new Error("BACKUP_SECONDARY_DIR must point to separate durable storage before backups can run."); }
  if (path.resolve(backupDirectory) === path.resolve(secondaryDirectory)) { throw new Error("BACKUP_SECONDARY_DIR must be separate from BACKUP_DIR."); }
  const filename = backupName(date);
  const localPath = await encryptedDump(backupDirectory, filename);
  await mkdir(secondaryDirectory, { recursive: true });
  await copyFile(localPath, path.join(secondaryDirectory, filename));
  await copyUploadsSnapshot(path.resolve(env.uploadDir), secondaryDirectory, date);
  if (date.getUTCDate() === 1) {
    const monthly = monthlyBackupName(date);
    await copyFile(localPath, path.join(backupDirectory, monthly));
    await copyFile(localPath, path.join(secondaryDirectory, monthly));
  }
  await pruneBackups(backupDirectory);
  await pruneBackups(secondaryDirectory);
  return { filename, bytes: (await stat(localPath)).size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackup().then(({ filename }) => process.stdout.write(`Encrypted database backup written: ${filename}\n`)).catch((error) => { console.error("Database backup failed.", error.message); process.exitCode = 1; });
}
