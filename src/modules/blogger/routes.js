export function registerRoutes(app, controller, requireRole, csrf, writeLimit) {
  app.get("/api/admin/blogger/connect", requireRole("owner"), controller.start);
  app.get("/api/admin/blogger/callback", requireRole("owner"), controller.callback);
  app.post("/api/admin/blogger/select", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.select);
  app.post("/api/admin/blogger/disconnect", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.disconnect);
  app.post("/api/admin/blogger/retry-failed", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.retryFailed);
  app.post("/api/admin/posts/:id/retry-blogger", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.retry);
}
