import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import { doubleCsrf } from "csrf-csrf";
import { env } from "../../config/env.js";
import { AUTH_LIMITS } from "../../config/constants.js";
import { pool } from "../../db/pool.js";
import { createAuthRepository } from "./repository.js";
import { createAuthService } from "./service.js";
import { createAuthController } from "./controller.js";
import { createRequireRole } from "./middleware.js";
import { registerRoutes } from "./routes.js";

const MySQLStore = MySQLStoreFactory(session);

export function createAuthModule(dependencies = {}) {
  const repository =
    dependencies.repository ??
    createAuthRepository(dependencies.database ?? pool);
  const emailer = dependencies.emailer ?? createEmailer();
  const service =
    dependencies.service ??
    createAuthService({
      repository,
      ownerEmail: dependencies.ownerEmail ?? env.ownerEmail,
      hashSecret: process.env.HASH_SECRET,
      emailer,
    });
  const oauthClient =
    dependencies.oauthClient ??
    new OAuth2Client({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
      redirectUri: `${env.siteUrl}/auth/google/callback`,
    });
  const controller = createAuthController({
    service,
    repository,
    oauthClient,
    generateCsrfToken: (request, response) =>
      csrf.generateCsrfToken(request, response),
    emailer,
    ownerEmail: env.ownerEmail,
    siteUrl: env.siteUrl,
  });
  const requireRole = createRequireRole(
    repository,
    dependencies.ownerEmail ?? env.ownerEmail,
  );
  const csrf = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET,
    getSessionIdentifier: (request) => request.session.id,
    getCsrfTokenFromRequest: (request) => request.body?._csrf,
    cookieName: "elatedquest.csrf",
    cookieOptions: {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
    },
  });
  return { repository, service, controller, requireRole, csrf };
}

export function createSessionMiddleware({
  store,
  secret = process.env.SESSION_SECRET,
} = {}) {
  const sessionStore =
    store ??
    new MySQLStore(
      {
        clearExpired: false,
        checkExpirationInterval: 15 * 60 * 1000,
        expiration: AUTH_LIMITS.sessionMaxAgeMs,
        createDatabaseTable: false,
        schema: {
          tableName: "sessions",
          columnNames: {
            session_id: "session_id",
            expires: "expires",
            data: "data",
          },
        },
      },
      pool,
    );
  return session({
    name: "elatedquest.sid",
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      maxAge: AUTH_LIMITS.sessionMaxAgeMs,
      path: "/",
    },
  });
}

function createEmailer() {
  const transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.password },
  });
  return {
    async sendSignInLink(email, token) {
      const link = `${env.siteUrl}/auth/email-link?token=${encodeURIComponent(token)}`;
      await transport.sendMail({
        from: env.smtp.from,
        to: email,
        subject: "Your ElatedQuest sign-in link",
        text: `Use this one-time link to sign in. It expires in 15 minutes: ${link}`,
      });
    },
  };
}

export function registerAuthRoutes(app, dependencies = {}) {
  const auth = createAuthModule(dependencies);
  registerRoutes(app, auth.controller, auth.requireRole, auth.csrf);
  return auth;
}
