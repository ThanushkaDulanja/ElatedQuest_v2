import { createTeamRepository } from "./repository.js";
import { createTeamService } from "./service.js";
import { createTeamController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

export function registerRoutes(app, { auth, database, emailer, ownerEmail, writeLimit, settingsService }) {
  const repository = createTeamRepository(database);
  const service = createTeamService({ repository, ownerEmail, emailer, settingsService });
  routes(app, createTeamController(service, auth.csrf), auth.requireRole, auth.csrf, writeLimit);
}
