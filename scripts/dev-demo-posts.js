import { databaseConfig, pool } from "../src/db/pool.js";
import { env } from "../src/config/env.js";
import { assertDemoDatabase, seedDemoPosts } from "../src/modules/site/demo.js";
import { createDemoRepository } from "../src/modules/site/repository.js";

try {
  assertDemoDatabase({ nodeEnv: env.nodeEnv, databaseName: databaseConfig.database, testDatabaseName: env.database.testName });
  const count = await seedDemoPosts(createDemoRepository(pool));
  process.stdout.write(`Created or refreshed ${count} demo posts in the development database.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally { await pool.end(); }
