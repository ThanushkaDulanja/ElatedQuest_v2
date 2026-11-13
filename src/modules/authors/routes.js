export function registerRoutes(app, controller, requireRole, csrf, writeLimit) {
  app.get("/aadmin/profile", requireRole("editor"), controller.profile);
  app.post("/api/admin/profile", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.saveProfile);
  app.get("/aadmin/team/authors", requireRole("owner"), controller.authors);
  app.post("/api/admin/authors/guest", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.guest);
  app.post("/api/admin/authors/:id", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.save);
}
