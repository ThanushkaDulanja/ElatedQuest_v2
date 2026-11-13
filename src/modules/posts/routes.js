export function registerRoutes(app, controller, requireRole, csrf, writeLimit) {
  app.get("/aadmin", requireRole("editor"), controller.dashboard);
  app.get("/api/admin/posts/suggest", requireRole("editor"), controller.suggest);
  app.post("/aadmin/posts/new", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.create);
  app.post("/aadmin/posts", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.create);
  app.get("/aadmin/preview/:id", requireRole("editor"), controller.preview);
  app.get("/aadmin/posts/:id", requireRole("editor"), controller.edit);
  app.post("/aadmin/posts/:id", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.save);
  app.post("/api/admin/posts/:id/revisions/:revisionId/restore", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.restore);
  app.post("/api/admin/posts/:id/:action", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.action);
  app.post("/api/admin/posts/:id/delete", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, controller.delete);
  app.get("/aadmin/categories", requireRole("owner"), controller.categories);
  app.post("/api/admin/categories", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.addCategory);
  app.post("/api/admin/categories/:id", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.updateCategory);
  app.post("/api/admin/categories/:id/delete", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.deleteCategory);
}
