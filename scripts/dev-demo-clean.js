import { databaseConfig, pool } from "../src/db/pool.js";
import { env } from "../src/config/env.js";
import { assertDemoDatabase, cleanDemoPosts } from "../src/modules/site/demo.js";
import { createDemoRepository } from "../src/modules/site/repository.js";

try {
  assertDemoDatabase({ nodeEnv: env.nodeEnv, databaseName: databaseConfig.database, testDatabaseName: env.database.testName });
  await cleanDemoPosts(createDemoRepository(pool));
  process.stdout.write("Removed demo posts and unused demo-only relationships from the development database.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally { await pool.end(); }
