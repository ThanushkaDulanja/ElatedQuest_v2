import { createAuthorsRepository } from "./repository.js";
import { createAuthorsService } from "./service.js";
import { createAuthorsController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

export function registerRoutes(app, { auth, database, writeLimit, mediaService }) { const service = createAuthorsService(createAuthorsRepository(database)); routes(app, createAuthorsController(service, auth.csrf, mediaService), auth.requireRole, auth.csrf, writeLimit); return service; }
