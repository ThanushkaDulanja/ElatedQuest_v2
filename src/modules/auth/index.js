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
import { createRequireRole, createResolveCurrentUser } from "./middleware.js";
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
  const resolveCurrentUser = createResolveCurrentUser(repository, dependencies.ownerEmail ?? env.ownerEmail);
  const csrf = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET,
    getSessionIdentifier: (request) => request.session.id,
    getCsrfTokenFromRequest: (request) => request.get("x-csrf-token") ?? request.body?._csrf,
    cookieName: "elatedquest.csrf",
    cookieOptions: {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
    },
  });
  return { repository, service, controller, requireRole, resolveCurrentUser, csrf, emailer };
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

export function createEmailer() {
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
    async sendInviteNotice(email) {
      await transport.sendMail({
        from: env.smtp.from,
        to: email,
        subject: "You have been invited to ElatedQuest",
        text: `You can now sign in at ${env.siteUrl}/aadmin/login.`,
      });
    },
    async sendPostSubmittedNotice(email, title) {
      await transport.sendMail({ from: env.smtp.from, to: email, subject: "A post is ready for review", text: `A post has been submitted for review: ${title}` });
    },
    async sendContactMessage(email, message) {
      await transport.sendMail({ from: env.smtp.from, to: email, replyTo: message.email, subject: `Contact message${message.subject ? `: ${message.subject}` : ""}`, text: `From: ${message.name} <${message.email}>\n\n${message.message}` });
    },
    async sendStorySubmission(email, story) {
      await transport.sendMail({ from: env.smtp.from, to: email, replyTo: story.email, subject: `Reader story: ${story.title}`, text: `From: ${story.name} <${story.email}>\nTitle: ${story.title}\n\n${story.body}\n\nLinks:\n${story.links.join("\n")}` });
    },
    async sendStoryReceipt(email, title) {
      await transport.sendMail({ from: env.smtp.from, to: email, subject: "We received your story", text: `Thank you for sharing “${title}” with Elated Quest. The team will review your submission.` });
    },
  };
}

export function registerAuthRoutes(app, dependencies = {}) {
  const auth = createAuthModule(dependencies);
  registerRoutes(app, auth.controller, auth.requireRole, auth.csrf);
  return auth;
}
