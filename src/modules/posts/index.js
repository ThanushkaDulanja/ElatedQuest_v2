import { createPostsRepository } from "./repository.js";
import { createPostsService } from "./service.js";
import { createPostsController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

export function registerRoutes(app, { auth, database, settingsService, bloggerService, emailer, ownerEmail, writeLimit, publicSiteService }) {
  const repository = createPostsRepository(database);
  const service = createPostsService({ repository, settingsService, bloggerService, emailer, ownerEmail });
  routes(app, createPostsController({ service, repository, bloggerService, csrf: auth.csrf, publicSiteService }), auth.requireRole, auth.csrf, writeLimit);
  return service;
}
