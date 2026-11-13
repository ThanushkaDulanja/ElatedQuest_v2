import "../config/env.js";
import { runCleanup } from "./maintenance.js";

runCleanup().then((count) => process.stdout.write(`Cleanup removed ${count} expired records.\n`)).catch((error) => { console.error("Cleanup job failed.", error.message); process.exitCode = 1; });
