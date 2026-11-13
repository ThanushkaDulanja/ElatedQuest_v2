import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "../db/pool.js";
import { invalidate } from "../lib/cache.js";
import { env } from "../config/env.js";
import { createBloggerRepository } from "../modules/blogger/repository.js";
import { createBloggerService } from "../modules/blogger/service.js";
import { createJobsRepository } from "./repository.js";

export function createPublishScheduledJob({ repository, bloggerService, logError = console.error }) {
  return async function publishScheduled() {
    const posts = await repository.publishDue();
    if (!posts.length) { return { published: 0 }; }
    invalidate("home");
    for (const post of posts) { invalidate(`post:${post.slug}`); }
    if (bloggerService && await repository.bloggerAutoSyncEnabled()) {
      for (const post of posts) {
        try { await bloggerService.syncPost(post.id); }
        catch (error) { logError("Scheduled post published locally; Blogger sync will retry.", error); }
      }
    }
    return { published: posts.length };
  };
}

export async function runPublishScheduled(database = pool) {
  const repository = createJobsRepository(database);
  const bloggerRepository = createBloggerRepository(database);
  const bloggerService = createBloggerService({ repository: bloggerRepository, clientId: env.google.clientId, clientSecret: env.google.clientSecret, redirectUri: `${env.siteUrl}/api/admin/blogger/callback`, encryptionKey: env.encryptionKey, siteUrl: env.siteUrl });
  return createPublishScheduledJob({ repository, bloggerService })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await runPublishScheduled(); process.stdout.write(`Published ${result.published} scheduled posts.\n`); }
  finally { await pool.end(); }
}
