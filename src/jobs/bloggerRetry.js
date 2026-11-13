import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { createBloggerRepository } from "../modules/blogger/repository.js";
import { createBloggerService } from "../modules/blogger/service.js";

export function createBloggerRetryJob({ repository, bloggerService, logError = console.error }) {
  return async function retryBloggerPosts() {
    const ids = await repository.retryCandidates();
    let attempted = 0;
    for (const id of ids) {
      try { await bloggerService.retryPost(id); attempted += 1; }
      catch (error) { logError(`Blogger retry failed for post ${id}.`, error); }
    }
    return { attempted };
  };
}

export async function runBloggerRetry(database = pool) {
  const repository = createBloggerRepository(database);
  const bloggerService = createBloggerService({ repository, clientId: env.google.clientId, clientSecret: env.google.clientSecret, redirectUri: `${env.siteUrl}/api/admin/blogger/callback`, encryptionKey: env.encryptionKey, siteUrl: env.siteUrl });
  return createBloggerRetryJob({ repository, bloggerService })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await runBloggerRetry(); process.stdout.write(`Retried ${result.attempted} Blogger posts.\n`); }
  finally { await pool.end(); }
}
