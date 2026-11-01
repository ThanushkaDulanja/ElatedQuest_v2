export const APP_LIMITS = Object.freeze({
  postTitle: 120,
  storyTitle: 120,
  seoTitle: 60,
  metaDescription: 160,
  excerpt: 200,
});

export const DATABASE_CONNECTION_LIMIT = 10;
export const DATABASE_CONNECT_TIMEOUT_MS = 5_000;
export const AUTH_LIMITS = Object.freeze({
  login: { hits: 10, windowMs: 15 * 60 * 1000 },
  email: { hits: 3, windowMs: 60 * 60 * 1000 },
  emailIp: { hits: 10, windowMs: 60 * 60 * 1000 },
  sessionMaxAgeMs: 14 * 24 * 60 * 60 * 1000,
  emailLinkMs: 15 * 60 * 1000,
  ownerLinkMs: 10 * 60 * 1000,
});

export const HTTP_STATUS = Object.freeze({
  ok: 200,
  serviceUnavailable: 503,
});
