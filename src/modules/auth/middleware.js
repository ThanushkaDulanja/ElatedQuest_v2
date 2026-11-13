import { createAuthRepository } from "./repository.js";
import { normalizeEmail } from "../../lib/email.js";

function effectiveUser(user, ownerEmail) {
  const role = normalizeEmail(user.email) === normalizeEmail(ownerEmail) ? "owner" : "editor";
  return { ...user, role };
}

export function createResolveCurrentUser(repository = createAuthRepository(), ownerEmail = process.env.OWNER_EMAIL) {
  return async function resolveCurrentUser(request, _response, next) {
    if (!request.session?.userId) { next(); return; }
    try {
      const user = await repository.findUserById(request.session.userId);
      if (!user || user.status !== "active") { request.session.userId = null; next(); return; }
      request.user = effectiveUser(user, ownerEmail);
      next();
    } catch (error) { next(error); }
  };
}

export function createRequireRole(
  repository = createAuthRepository(),
  ownerEmail = process.env.OWNER_EMAIL,
) {
  return function requireRole(
    requiredRole = "editor",
    { allowAnonymous = false } = {},
  ) {
    return async function roleGuard(request, response, next) {
      try {
        const user = request.session?.userId
          ? await repository.findUserById(request.session.userId)
          : null;
        if (!user || user.status !== "active") {
          if (request.session) {
            request.session.userId = null;
          }
          if (allowAnonymous) {
            next();
            return;
          }
          response.redirect("/aadmin/login");
          return;
        }
        const effectiveRole = effectiveUser(user, ownerEmail).role;
        if (requiredRole === "owner" && effectiveRole !== "owner") {
          response.status(403).render("errors/403.njk", {
            requestId: request.requestId,
          });
          return;
        }
        request.user = { ...user, role: effectiveRole };
        next();
      } catch (error) {
        next(error);
      }
    };
  };
}
