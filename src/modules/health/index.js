import * as repository from "./repository.js";
import { createHealthController } from "./controller.js";
import { registerRoutes as registerHealthRoutes } from "./routes.js";
import { createHealthService } from "./service.js";

export function registerRoutes(app, dependencies = {}) {
  const healthRepository = dependencies.repository ?? repository;
  const service = createHealthService(healthRepository);
  const controller = createHealthController(service);
  registerHealthRoutes(app, controller);
}
