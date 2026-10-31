import { registerRoutes as registerHealthRoutes } from "./health/index.js";

const modules = [registerHealthRoutes];

export function registerModules(app, dependencies = {}) {
  for (const registerModuleRoutes of modules) {
    registerModuleRoutes(app, dependencies.health);
  }
}
