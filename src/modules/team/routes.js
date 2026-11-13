export function registerRoutes(app, controller, requireRole, csrf, writeLimit) {
  app.get("/aadmin/team", requireRole("owner"), controller.page);
  app.post("/api/admin/team", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.invite);
  app.post("/api/admin/team/:id/:action", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.action);
}
