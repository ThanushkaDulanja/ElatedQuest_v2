import { ADMIN_WRITE_LIMIT } from "../config/constants.js";

export function createAdminWriteLimit(repository) {
  return async function adminWriteLimit(request, response, next) {
    try {
      const result = await repository.incrementRateLimit(`admin-write:${request.user.id}`, ADMIN_WRITE_LIMIT.hits, ADMIN_WRITE_LIMIT.windowMs);
      if (!result.allowed) { response.status(429).type("text/plain").send("Too many changes. Try again later."); return; }
      next();
    } catch (error) { next(error); }
  };
}
