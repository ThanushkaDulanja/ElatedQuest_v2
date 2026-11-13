import { env } from "../../config/env.js";
import { pool } from "../../db/pool.js";
import { createBloggerRepository } from "./repository.js";
import { createBloggerService } from "./service.js";
import { createBloggerController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

export function registerRoutes(app, { auth, database = pool, writeLimit, siteUrl = env.siteUrl, oauthClientFactory }) {
  const repository = createBloggerRepository(database);
  const service = createBloggerService({ repository, clientId: env.google.clientId, clientSecret: env.google.clientSecret, redirectUri: `${siteUrl}/api/admin/blogger/callback`, encryptionKey: env.encryptionKey, siteUrl, oauthClientFactory });
  routes(app, createBloggerController(service, auth.csrf), auth.requireRole, auth.csrf, writeLimit);
  return service;
}
