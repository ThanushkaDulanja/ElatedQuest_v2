import { registerRoutes as registerHealthRoutes } from "./health/index.js";
import { registerRoutes as registerTeamRoutes } from "./team/index.js";
import { registerRoutes as registerAuthorsRoutes } from "./authors/index.js";
import { registerRoutes as registerSettingsRoutes } from "./settings/index.js";
import { registerRoutes as registerAuditRoutes } from "./audit/index.js";
import { createAdminWriteLimit } from "../middleware/adminWriteLimit.js";
import { registerRoutes as registerPostRoutes } from "./posts/index.js";
import { registerRoutes as registerMediaRoutes } from "./media/index.js";
import { registerRoutes as registerBloggerRoutes } from "./blogger/index.js";
import { createPublicSiteRepository } from "./site/repository.public.js";
import { createSiteService } from "./site/service.js";
import { registerSiteRoutes } from "./site/routes.js";
import { registerComments } from "./comments/index.js";
import { registerRatings } from "./ratings/index.js";
import { createPersistentRateLimiter } from "../lib/window-rate-limiter.js";
import { registerContact } from "./contact/index.js";
import { createAdsService } from "./ads/service.js";
import { registerAdsRoutes } from "./ads/routes.js";
import { env } from "../config/env.js";
import { registerPages } from "./pages/index.js";
import { registerSeoRoutes } from "./seo/index.js";

export function registerModules(app, dependencies = {}) {
  registerHealthRoutes(app, dependencies.health);
  const auth = dependencies.auth;
  const featureDependencies = { auth, database: dependencies.adminM2?.database, ownerEmail: dependencies.auth?.service?.ownerEmail ?? process.env.OWNER_EMAIL, emailer: auth?.emailer, writeLimit: createAdminWriteLimit(auth.repository) };
  const mediaService = registerMediaRoutes(app, featureDependencies);
  const bloggerService = registerBloggerRoutes(app, featureDependencies);
  const settingsService = registerSettingsRoutes(app, { ...featureDependencies, bloggerService });
  const registeredPagesService = registerPages(app, { ...featureDependencies, database: dependencies.site?.database ?? featureDependencies.database, auth });
  const pagesService = dependencies.site?.pagesService ?? (dependencies.site?.repository ? undefined : registeredPagesService);
  const adsService = dependencies.ads?.service ?? (dependencies.site ? { async publicSettings() { return { enabled: false, slots: {} }; }, async slot() { return null; }, async adsTxt() { return ""; } } : createAdsService(settingsService));
  registerAdsRoutes(app, adsService);
  const engagementLimiter = createPersistentRateLimiter(auth.repository, 60, 60 * 60 * 1000, "engagement");
  const commentLimiter = createPersistentRateLimiter(auth.repository, 5, 10 * 60 * 1000, "comment");
  const commentsService = dependencies.site?.commentsService ?? registerComments(app, { ...featureDependencies, settingsService, engagementLimiter, commentLimiter, requireRole: auth.requireRole, csrf: auth.csrf, siteUrl: process.env.SITE_URL });
  registerRatings(app, { ...featureDependencies, engagementLimiter, siteUrl: process.env.SITE_URL });
  registerTeamRoutes(app, { ...featureDependencies, settingsService });
  const registeredAuthorsService = registerAuthorsRoutes(app, { ...featureDependencies, mediaService });
  const authorsService = dependencies.site?.authorsService ?? registeredAuthorsService;
  registerAuditRoutes(app, { ...featureDependencies, settingsService });
  const publicSiteRepository = dependencies.site?.repository ?? createPublicSiteRepository(dependencies.site?.database ?? featureDependencies.database);
  const siteService = createSiteService(publicSiteRepository, { siteUrl: process.env.SITE_URL, pagesService });
  registerSeoRoutes(app, { database: dependencies.site?.database ?? featureDependencies.database, siteUrl: env.siteUrl, plausibleDomain: env.plausibleDomain });
  const postsService = registerPostRoutes(app, { ...featureDependencies, settingsService, bloggerService, ownerEmail: dependencies.auth?.service?.ownerEmail ?? process.env.OWNER_EMAIL, publicSiteService: siteService });
  if (!dependencies.site?.contactService) { registerContact(app, { auth, database: dependencies.site?.database ?? featureDependencies.database, siteService, writeLimit: featureDependencies.writeLimit, contactEmail: env.contactEmail, submissionsEmail: env.submissionsEmail }); }
  registerSiteRoutes(app, { service: siteService, authorsService, postsService: dependencies.site?.postsService ?? postsService, commentsService, adsService, rateLimitRepository: auth.repository });
}
