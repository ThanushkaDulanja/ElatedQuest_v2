import express from "express";
import nunjucks from "nunjucks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerModules } from "./modules/index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(currentDirectory, "..");

export function createApp(dependencies = {}) {
  const app = express();
  const viewsDirectory = path.join(currentDirectory, "views");
  const publicDirectory = path.join(projectDirectory, "public");

  app.disable("x-powered-by");
  app.set("view engine", "njk");
  nunjucks.configure(viewsDirectory, {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== "production",
  });
  app.use(express.static(publicDirectory, { index: false }));

  registerModules(app, dependencies);

  app.use((_request, response) => {
    response.status(404).type("text/plain").send("Not Found");
  });

  app.use((error, _request, response, _next) => {
    if (response.headersSent) {
      return;
    }
    response.status(500).type("text/plain").send("Internal Server Error");
  });

  return app;
}
