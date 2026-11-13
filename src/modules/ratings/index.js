import { visitorHash } from "../../lib/visitor-hash.js";
import { createRatingsRepository } from "./repository.js";

export function registerRatings(app, { database, engagementLimiter, siteUrl = process.env.SITE_URL ?? "http://localhost:3000" }) {
  const repository = createRatingsRepository(database);
  app.post("/api/posts/:id/rating", async (request, response, next) => {
    const origin = request.get("origin") || request.get("referer");
    try { if (new URL(origin).origin !== new URL(siteUrl).origin) { return response.status(403).json({ error: "A same-origin request is required." }); } } catch { return response.status(403).json({ error: "A same-origin request is required." }); }
    const stars = Number(request.body.stars);
    if (!Number.isSafeInteger(stars) || stars < 1 || stars > 5) { return response.status(400).json({ error: "Choose a rating from 1 to 5 stars." }); }
    const key = visitorHash(request.ip, request.get("user-agent") ?? "");
    if (!await engagementLimiter.allow(key)) { return response.status(429).json({ error: "Please wait before rating again." }); }
    try {
      const result = await repository.setRating(Number(request.params.id), key, stars);
      if (request.accepts("html")) { return result ? response.redirect(303, `/${result.slug}?rated=1#rating`) : response.status(404).send("Post not found."); }
      return result ? response.json({ count: result.count, average: Number((result.sum / result.count).toFixed(1)), message: result.count < 3 ? "Thanks for rating." : `${(result.sum / result.count).toFixed(1)} / 5 · ${result.count} votes` }) : response.status(404).json({ error: "Post not found." });
    } catch (error) { return next(error); }
  });
}
