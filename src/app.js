import express from "express";
import helmet from "helmet";
import nunjucks from "nunjucks";
import cookieParser from "cookie-parser";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { buildContentSecurityPolicy } from "./config/security.js";
import { captureException } from "./lib/monitoring.js";
import { roleLabel } from "./modules/auth/role-label.js";
import { registerModules } from "./modules/index.js";
import { formatDate, toIsoDateTime } from "./lib/time.js";
import {
  createSessionMiddleware,
  registerAuthRoutes,
} from "./modules/auth/index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(currentDirectory, "..");

export function createApp(dependencies = {}) {
  const app = express();
  const viewsDirectory = path.join(currentDirectory, "views");
  const publicDirectory = path.join(projectDirectory, "public");
  const uploadDirectory = path.resolve(projectDirectory, env.uploadDir);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: "strict-origin-when-cross-origin" }, strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true } }));
  app.use((_request, response, next) => {
    const uploadsOrigin = new URL(env.uploadsPublicUrl).origin;
    const nonce = randomBytes(18).toString("base64");
    response.locals.cspNonce = nonce;
    response.locals.sentryDsn = env.sentryDsn;
    let sentryOrigin = "";
    try { sentryOrigin = env.sentryDsn ? new URL(env.sentryDsn).origin : ""; } catch { /* An invalid optional DSN disables browser reporting. */ }
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    response.setHeader("Content-Security-Policy", buildContentSecurityPolicy({ nonce, uploadsOrigin, analytics: Boolean(env.plausibleDomain), sentryOrigin }));
    next();
  });
  app.set("view engine", "njk");
  const views = nunjucks.configure(viewsDirectory, {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== "production",
  });
  views.addFilter("roleLabel", roleLabel);
  views.addFilter("formatDate", formatDate);
  views.addFilter("dateIso", toIsoDateTime);
  app.use("/uploads", express.static(uploadDirectory, { index: false, dotfiles: "deny", immutable: true, maxAge: "1y", setHeaders(response) { response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Cache-Control", "public, max-age=31536000, immutable"); } }));
  app.use(express.static(publicDirectory, { index: false }));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    dependencies.sessionMiddleware ??
      createSessionMiddleware({ store: dependencies.sessionStore }),
  );
  app.use(cookieParser());
  app.use((request, response, next) => {
    request.requestId = randomBytes(4).toString("hex");
    response.set("X-Request-Id", request.requestId);
    next();
  });
  app.use(["/aadmin", "/api/admin"], (_request, response, next) => {
    response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    next();
  });

  const auth = registerAuthRoutes(app, dependencies.auth);
  app.use(auth.resolveCurrentUser);
  registerModules(app, { ...dependencies, auth });

  app.use((_request, response) => {
    response.status(404).render("errors/404.njk", { requestId: response.get("X-Request-Id") });
  });

  app.use((error, request, response, _next) => {
    if (response.headersSent) {
      return;
    }
    if (error.code === "EBADCSRFTOKEN") {
      response.status(403).render("errors/403.njk", { requestId: request.requestId });
      return;
    }
    (dependencies.logError ?? console.error)(`request_id=${request.requestId}`, error);
    (dependencies.captureException ?? captureException)(error, { requestId: request.requestId });
    response.status(500).render("errors/500.njk", { requestId: request.requestId });
  });

  return app;
}
