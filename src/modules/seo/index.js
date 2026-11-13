import { createSeoRepository } from "./repository.js";
import { createSeoController } from "./controller.js";
import { registerRoutes } from "./routes.js";

export function registerSeoRoutes(app, { database, siteUrl, plausibleDomain }) {
  const repository = createSeoRepository(database);
  registerRoutes(app, createSeoController(repository, { siteUrl, plausibleDomain }));
}
