import { createPersistentRateLimiter } from "../../lib/window-rate-limiter.js";
import { createContactRepository } from "./repository.js";
import { createContactService } from "./service.js";
import { createContactController } from "./controller.js";

export function registerContact(app, { auth, database, siteService, writeLimit, contactEmail = process.env.CONTACT_EMAIL, submissionsEmail = process.env.SUBMISSIONS_EMAIL }) {
  const repository = createContactRepository(database);
  const service = createContactService({ repository, emailer: auth.emailer, rateLimiter: createPersistentRateLimiter(auth.repository, 3, 60 * 60 * 1000, "form"), contactEmail, submissionsEmail });
  const controller = createContactController({ service, siteService, csrf: auth.csrf });
  const sameOrigin = (request, response, next) => {
    const value = request.get("origin") || request.get("referer");
    try { if (new URL(value).origin === new URL(process.env.SITE_URL ?? "http://localhost:3000").origin) { return next(); } } catch { /* reject missing or invalid origins */ }
    return response.status(403).send("A same-origin request is required.");
  };
  app.get("/contact-us", controller.contactPage);
  app.post("/contact-us", sameOrigin, auth.csrf.doubleCsrfProtection, controller.submit);
  app.get("/aadmin/inbox", auth.requireRole("editor"), controller.storiesInbox);
  app.get("/aadmin/inbox", auth.requireRole("owner"), controller.messagesInbox);
  app.post("/api/admin/submissions/:id/convert", auth.requireRole("editor"), auth.csrf.doubleCsrfProtection, writeLimit, controller.convertStory);
  app.post("/api/admin/submissions/:id/:action", auth.requireRole("editor"), auth.csrf.doubleCsrfProtection, writeLimit, controller.storyStatus);
  app.post("/api/admin/messages/:id/:action", auth.requireRole("owner"), auth.csrf.doubleCsrfProtection, writeLimit, controller.messageStatus);
  return service;
}
