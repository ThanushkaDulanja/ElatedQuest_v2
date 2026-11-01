export function registerRoutes(app, controller, requireRole, csrf) {
  app.get(
    "/aadmin/login",
    requireRole("editor", { allowAnonymous: true }),
    controller.showLogin,
  );
  app.get("/auth/google", controller.beginGoogle);
  app.get("/auth/google/callback", controller.googleCallback);
  app.post("/auth/email", csrf.doubleCsrfProtection, controller.requestEmail);
  app.get("/auth/email-link", controller.redeemEmail);
  app.get("/auth/owner-link", controller.redeemOwner);
  app.post(
    "/auth/sign-out",
    requireRole("editor"),
    csrf.doubleCsrfProtection,
    controller.signOut,
  );
  app.get("/aadmin", requireRole("editor"), controller.dashboard);
}
