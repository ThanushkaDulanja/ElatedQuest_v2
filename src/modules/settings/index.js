import { createSettingsRepository } from "./repository.js";
import { createSettingsService } from "./service.js";
import { createSettingsController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

export function registerRoutes(app, { auth, database, writeLimit, bloggerService }) { const service = createSettingsService(createSettingsRepository(database)); routes(app, createSettingsController(service, auth.csrf, bloggerService), auth.requireRole, auth.csrf, writeLimit); return service; }
