import "../config/env.js";
import { runRecount } from "./maintenance.js";

runRecount().then(() => process.stdout.write("Post counters rebuilt.\n")).catch((error) => { console.error("Recount job failed.", error.message); process.exitCode = 1; });
