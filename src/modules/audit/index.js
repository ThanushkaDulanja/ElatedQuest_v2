import { createAuditRepository } from "./repository.js";
import { createAuditService } from "./service.js";
import { createAuditController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

export function registerRoutes(app, { auth, database, settingsService }) { routes(app, createAuditController(createAuditService(createAuditRepository(database), settingsService), auth.csrf), auth.requireRole); }
