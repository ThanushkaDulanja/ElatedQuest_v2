export const APP_LIMITS = Object.freeze({
  postTitle: 120,
  storyTitle: 120,
  seoTitle: 60,
  metaDescription: 160,
  excerpt: 200,
});

export const DATABASE_CONNECTION_LIMIT = 10;
export const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

export const HTTP_STATUS = Object.freeze({
  ok: 200,
  serviceUnavailable: 503,
});
