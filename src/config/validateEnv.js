import { normalizeEmail } from "../lib/email.js";

const REQUIRED_VARIABLES = [
  "NODE_ENV",
  "PORT",
  "SITE_URL",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "SESSION_SECRET",
  "HASH_SECRET",
  "OWNER_EMAIL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "SUBMISSIONS_EMAIL",
  "CONTACT_EMAIL",
  "ENCRYPTION_KEY",
  "UPLOAD_DIR",
  "UPLOADS_PUBLIC_URL",
];

function parsePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${name} must be an integer from 0 to 65535.`);
  }
  return port;
}

function requireEmail(value, name) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${name} must be a valid email address.`);
  }
  return email;
}

function requireUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

export function validateEnv(source) {
  const missing = REQUIRED_VARIABLES.filter((name) => {
    return typeof source[name] !== "string" || source[name].trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  if (!["development", "test", "production"].includes(source.NODE_ENV)) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  const siteUrl = requireUrl(source.SITE_URL, "SITE_URL");
  const uploadsUrl = requireUrl(
    source.UPLOADS_PUBLIC_URL,
    "UPLOADS_PUBLIC_URL",
  );
  if (!["http:", "https:"].includes(siteUrl.protocol)) {
    throw new Error("SITE_URL must use http or https.");
  }
  if (!["http:", "https:"].includes(uploadsUrl.protocol)) {
    throw new Error("UPLOADS_PUBLIC_URL must use http or https.");
  }

  const encryptionKey = Buffer.from(source.ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return Object.freeze({
    nodeEnv: source.NODE_ENV,
    port: parsePort(source.PORT, "PORT"),
    siteUrl: siteUrl.toString().replace(/\/$/, ""),
    database: Object.freeze({
      host: source.DB_HOST.trim(),
      port: parsePort(source.DB_PORT, "DB_PORT"),
      user: source.DB_USER,
      password: source.DB_PASSWORD,
      name: source.DB_NAME,
    }),
    ownerEmail: requireEmail(source.OWNER_EMAIL, "OWNER_EMAIL"),
    google: Object.freeze({
      clientId: source.GOOGLE_CLIENT_ID,
      clientSecret: source.GOOGLE_CLIENT_SECRET,
    }),
    smtp: Object.freeze({
      host: source.SMTP_HOST.trim(),
      port: parsePort(source.SMTP_PORT, "SMTP_PORT"),
      user: source.SMTP_USER,
      password: source.SMTP_PASS,
      from: source.EMAIL_FROM,
    }),
    submissionsEmail: requireEmail(
      source.SUBMISSIONS_EMAIL,
      "SUBMISSIONS_EMAIL",
    ),
    contactEmail: requireEmail(source.CONTACT_EMAIL, "CONTACT_EMAIL"),
    encryptionKey,
    uploadDir: source.UPLOAD_DIR,
    uploadsPublicUrl: uploadsUrl.toString().replace(/\/$/, ""),
    sentryDsn: source.SENTRY_DSN?.trim() || "",
    plausibleDomain: source.PLAUSIBLE_DOMAIN?.trim() || "",
  });
}
