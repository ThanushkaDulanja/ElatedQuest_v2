import "../src/config/env.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";
import { decryptBackupToSql } from "../src/jobs/backup.js";

function run(command, args, options = {}) {
  const child = spawn(command, args, { env: { ...process.env, MYSQL_PWD: env.database.password }, windowsHide: true, stdio: ["ignore", "pipe", "ignore"], ...options });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  return once(child, "close").then(([code]) => {
    if (code !== 0) { throw new Error(`${command} failed.`); }
    return output;
  });
}

async function main() {
  const backupPath = process.argv[2];
  const scratchDb = process.env.RESTORE_SCRATCH_DB ?? "";
  if (!backupPath || !/^[A-Za-z0-9_]+$/u.test(scratchDb) || scratchDb === env.database.name) {
    throw new Error("Usage: RESTORE_SCRATCH_DB=empty_scratch_database node scripts/restore-backup.js <backup-file>");
  }
  const mysqlArgs = ["--host", env.database.host, "--port", String(env.database.port), "--user", env.database.user, "--batch", "--skip-column-names"];
  if ((await run("mysql", [...mysqlArgs, scratchDb, "--execute", "SHOW TABLES"])).trim()) {
    throw new Error("Restore target must be an existing empty scratch database; no changes were made.");
  }
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "elatedquest-restore-"));
  const sqlPath = path.join(temporaryDirectory, "backup.sql");
  const scratchSqlPath = path.join(temporaryDirectory, "scratch.sql");
  try {
    await decryptBackupToSql(path.resolve(backupPath), sqlPath);
    let replaced = false;
    const input = createInterface({ input: createReadStream(sqlPath), crlfDelay: Infinity });
    const output = createWriteStream(scratchSqlPath, { flags: "wx" });
    try {
      for await (const line of input) {
        const target = line.trim() === `USE \`${env.database.name}\`;` ? `USE \`${scratchDb}\`;` : line;
        if (target !== line) { replaced = true; }
        if (!output.write(`${target}\n`)) { await new Promise((resolve) => output.once("drain", resolve)); }
      }
      output.end();
      await once(output, "finish");
    } catch (error) { output.destroy(); throw error; }
    if (!replaced) { throw new Error("Backup did not contain the expected source database marker."); }
    const child = spawn("mysql", [...mysqlArgs, scratchDb], { env: { ...process.env, MYSQL_PWD: env.database.password }, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
    const finished = once(child, "close");
    await pipeline(createReadStream(scratchSqlPath), child.stdin);
    const [code] = await finished;
    if (code !== 0) { throw new Error("mysql restore failed."); }
    process.stdout.write(`Restore completed in scratch database ${scratchDb}. Verify posts, users, and media links.\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error("Restore drill failed.", error.message); process.exitCode = 1; });
}
