import { createPagesRepository } from "./repository.js";
import { createPagesService } from "./service.js";
import { createPagesController } from "./controller.js";
import { registerRoutes } from "./routes.js";

export function registerPages(app, { auth, database, writeLimit }) {
  const service = createPagesService(createPagesRepository(database));
  registerRoutes(app, createPagesController(service, auth.csrf), { requireRole: auth.requireRole, csrf: auth.csrf, writeLimit });
  return service;
}
