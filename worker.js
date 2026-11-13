import "./src/config/env.js";
import cron from "node-cron";
import { runPublishScheduled } from "./src/jobs/publishScheduled.js";
import { runBloggerRetry } from "./src/jobs/bloggerRetry.js";
import { runCleanup, runRecount } from "./src/jobs/maintenance.js";
import { runBackup } from "./src/jobs/backup.js";
import { captureJobError } from "./src/lib/monitoring.js";

export function startWorker() {
  const publishScheduled = cron.schedule("*/5 * * * *", () => { void runPublishScheduled().catch((error) => console.error("Scheduled publishing job failed.", error)); }, { timezone: "UTC" });
  const bloggerRetry = cron.schedule("*/15 * * * *", () => { void runBloggerRetry().catch((error) => console.error("Blogger retry job failed.", error)); }, { timezone: "UTC" });
  const cleanup = cron.schedule("0 2 * * *", () => { void runCleanup().catch((error) => { console.error("Cleanup job failed.", error); captureJobError(error, "cleanup"); }); }, { timezone: "UTC" });
  const recount = cron.schedule("15 2 * * *", () => { void runRecount().catch((error) => { console.error("Recount job failed.", error); captureJobError(error, "recount"); }); }, { timezone: "UTC" });
  const backup = cron.schedule("30 2 * * *", () => { void runBackup().catch((error) => { console.error("Database backup failed.", error.message); captureJobError(error, "backup"); }); }, { timezone: "UTC" });
  process.stdout.write("ElatedQuest worker: publishing 5m; Blogger retries 15m; cleanup, recount and encrypted backup daily at 02:00 UTC.\n");
  return { stop() { publishScheduled.stop(); bloggerRetry.stop(); cleanup.stop(); recount.stop(); backup.stop(); } };
}

startWorker();
