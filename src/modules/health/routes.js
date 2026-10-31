export function registerRoutes(app, controller) {
  app.get("/api/health", controller.show);
}
