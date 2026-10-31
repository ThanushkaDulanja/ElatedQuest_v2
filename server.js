import { createServer } from "node:http";
import { env } from "./src/config/env.js";
import { createApp } from "./src/app.js";
import { pool } from "./src/db/pool.js";

const app = createApp();
const server = createServer(app);

server.listen(env.port, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : env.port;
  process.stdout.write(
    `ElatedQuest server listening on http://127.0.0.1:${port}\n`,
  );
});

async function shutDown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
