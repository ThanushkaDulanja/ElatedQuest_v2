export function registerRoutes(app, controller, requireRole, csrf, writeLimit) {
  app.get("/aadmin/settings", requireRole("owner"), controller.page);
  app.get("/aadmin/settings/social", requireRole("owner"), controller.socialPage);
  app.get("/aadmin/settings/ads", requireRole("owner"), controller.adsPage);
  app.post("/api/admin/settings", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.save);
  app.post("/api/admin/settings/social-links", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.saveSocial);
  app.post("/api/admin/settings/menus", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.saveMenus);
  app.post("/api/admin/settings/ads", requireRole("owner"), csrf.doubleCsrfProtection, writeLimit, controller.saveAds);
}
