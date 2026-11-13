export function registerRoutes(app, controller, requireRole, csrf, writeLimit, uploadLimit, uploadOne, uploadError) {
  app.get("/aadmin/media", requireRole("editor"), controller.page);
  app.get("/api/admin/media", requireRole("editor"), controller.picker);
  app.post("/api/admin/media", requireRole("editor"), writeLimit, uploadLimit, uploadOne, uploadError, csrf.doubleCsrfProtection, controller.upload);
  app.post("/api/admin/media/:id", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.update);
  app.post("/api/admin/media/:id/delete", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.delete);
}
