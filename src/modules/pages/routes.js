export function registerRoutes(app, controller, { requireRole, csrf, writeLimit }) {
  app.get("/aadmin/pages", requireRole("owner"), controller.list);
  app.get("/aadmin/pages/:slug", requireRole("owner"), controller.edit);
  app.post("/aadmin/pages/:slug", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.save);
}
