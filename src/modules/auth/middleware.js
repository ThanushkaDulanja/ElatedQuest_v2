import { createAuthRepository } from "./repository.js";
import { normalizeEmail } from "../../lib/email.js";

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
        const effectiveRole =
          normalizeEmail(user.email) === normalizeEmail(ownerEmail)
            ? "owner"
            : "editor";
        if (requiredRole === "owner" && effectiveRole !== "owner") {
          response.status(403).send("Forbidden");
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
