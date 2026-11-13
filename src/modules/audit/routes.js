export function registerRoutes(app, controller, requireRole) { app.get("/aadmin/audit", requireRole("owner"), controller.page); }
