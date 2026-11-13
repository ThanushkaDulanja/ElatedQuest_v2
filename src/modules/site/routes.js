import { createSiteController } from "./controller.js";
import { createPublicSearchLimit, createPublicViewLimit } from "./publicRateLimit.js";
import { publicPageCache } from "./renderCache.js";

export function registerSiteRoutes(app, { service, authorsService, postsService, commentsService, adsService, rateLimitRepository }) {
  const controller = createSiteController({ service, authorsService, postsService, commentsService, adsService });
  const feedCache = (request, response, next) => { void adsService.publicSettings(response, ["home_feed"]).then(() => publicPageCache(request, response, next), next); };
  const postCache = async (request, response, next) => {
    try {
      const ads = await adsService.publicSettings();
      if (ads.slots.post_after_p3?.enabled || ads.slots.post_end?.enabled || ads.slots.post_sidebar?.enabled) {
        const result = await service.resolveSlug(String(request.params.slug ?? "").toLowerCase());
        if (result.type === "post") { await adsService.publicSettings(response, ["post_after_p3", "post_end", "post_sidebar"]); }
      }
      next();
    } catch (error) { next(error); }
  };
  app.get("/", feedCache, controller.home);
  app.get("/category/:slug", feedCache, (request, response, next) => { request.params.kind = "category"; next(); }, controller.archive);
  app.get("/tag/:slug", (request, response, next) => { request.params.kind = "tag"; next(); }, controller.archive);
  app.get("/author/:slug", publicPageCache, (request, response, next) => { request.params.kind = "author"; next(); }, controller.archive);
  const searchLimit = createPublicSearchLimit({ repository: rateLimitRepository });
  app.get("/search", searchLimit, controller.search);
  app.get("/api/search", searchLimit, controller.searchApi);
  app.get("/api/posts/also-reading", controller.alsoReading);
  app.get("/api/posts", controller.postsApi);
  app.get("/api/posts/popular", controller.popularApi);
  app.get("/api/posts/by-ids", controller.savedApi);
  app.get("/saved", controller.saved);
  app.get("/random", controller.random);
  app.get("/thank-you", controller.thankYou);
  app.post("/api/posts/:id/view", createPublicViewLimit({ repository: rateLimitRepository }), controller.view);
  app.get("/:slug", postCache, controller.slug);
  app.use(controller.notFound);
  app.use(controller.error);
}
