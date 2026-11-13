import { createCommentsRepository } from "./repository.js";
import { createCommentsService } from "./service.js";

export function registerComments(app, { database, settingsService, engagementLimiter, commentLimiter, requireRole, csrf, writeLimit, siteUrl = process.env.SITE_URL ?? "http://localhost:3000" }) {
  const repository = createCommentsRepository(database);
  const service = createCommentsService(repository, settingsService, engagementLimiter, commentLimiter);
  const sameOrigin = (request, response, next) => {
    const value = request.get("origin") || request.get("referer");
    try { if (new URL(value).origin === new URL(siteUrl).origin) { return next(); } } catch { /* reject missing or invalid origins */ }
    return response.status(403).json({ error: "A same-origin request is required." });
  };
  app.get("/api/posts/:id/comments", async (request, response, next) => {
    try { response.json(await service.list(Number(request.params.id), request.query.sort, request.query.offset)); } catch (error) { next(error); }
  });
  app.post("/api/posts/:id/comments", sameOrigin, async (request, response, next) => {
    try {
      const result = await service.submit({ ...request.body, postId: request.params.id, voterHash: service.visitorHash(request.ip, request.get("user-agent") ?? "") });
      if (request.accepts("html")) { const slug = await repository.postSlug(Number(request.params.id)); return response.redirect(303, slug ? `/${slug}?comment=${result.visible ? "approved" : "pending"}#comments` : "/"); }
      return response.status(201).json(result);
    } catch (error) {
      if (request.accepts("html")) { const slug = await repository.postSlug(Number(request.params.id)); return response.redirect(303, slug ? `/${slug}?comment=error#comments` : "/"); }
      if (error.status) { return response.status(error.status).json({ error: error.message }); }
      return next(error);
    }
  });
  app.post("/api/comments/:id/vote", sameOrigin, async (request, response, next) => {
    try {
      const voterHash = service.visitorHash(request.ip, request.get("user-agent") ?? "");
      if (!await service.rateLimit(voterHash)) { return response.status(429).json({ error: "Please wait before voting again." }); }
      const result = await service.vote(Number(request.params.id), voterHash, Number(request.body.value));
      if (request.accepts("html")) { return response.redirect(303, request.body.postSlug ? `/${request.body.postSlug}#comments` : "/"); }
      return result ? response.status(204).end() : response.status(404).json({ error: "Comment not found." });
    } catch (error) { if (error.status) { return response.status(error.status).json({ error: error.message }); } return next(error); }
  });
  app.get("/aadmin/inbox", requireRole("editor"), async (request, response, next) => {
    try {
      if (request.query.tab && request.query.tab !== "comments") { return next("route"); }
      const rows = await repository.listPending();
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      response.render("admin/comments.njk", { title: "Inbox · Comments", section: "comments", comments: rows, csrfToken: csrf.generateCsrfToken(request, response), user: request.user });
    } catch (error) { next(error); }
  });
  app.get("/aadmin/comments", requireRole("editor"), (_request, response) => response.redirect("/aadmin/inbox?tab=comments"));
  app.post("/api/admin/comments/:id/:action", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, async (request, response, next) => {
    try {
      const statuses = { approve: "approved", spam: "spam", trash: "trashed" };
      if (!statuses[request.params.action]) { return response.sendStatus(404); }
      await service.moderate(request.params.id, statuses[request.params.action]);
      return response.redirect("/aadmin/inbox?tab=comments");
    } catch (error) { next(error); }
  });
  app.post("/api/admin/comments/:id/reply", requireRole("editor"), csrf.doubleCsrfProtection, writeLimit, async (request, response, next) => {
    try {
      await service.staffReply({ postId: request.body.postId, parentId: request.params.id, body: request.body.body, staffName: request.user.display_name || "Elated Quest Team", staffEmail: request.user.email });
      return response.redirect("/aadmin/inbox?tab=comments");
    } catch (error) { if (error.status) { return response.status(error.status).send(error.message); } return next(error); }
  });
  return service;
}
