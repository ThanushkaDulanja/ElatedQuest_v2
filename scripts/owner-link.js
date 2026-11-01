import "../src/config/env.js";
import { env } from "../src/config/env.js";
import { pool } from "../src/db/pool.js";
import { createAuthRepository } from "../src/modules/auth/repository.js";
import { createAuthService } from "../src/modules/auth/service.js";

const repository = createAuthRepository(pool);
const service = createAuthService({
  repository,
  ownerEmail: env.ownerEmail,
  hashSecret: process.env.HASH_SECRET,
  emailer: {},
});

try {
  const token = await service.createOwnerLink();
  process.stdout.write(
    `${env.siteUrl}/auth/owner-link?token=${encodeURIComponent(token)}\n`,
  );
} finally {
  await pool.end();
}
