export const APP_LIMITS = Object.freeze({
  postTitle: 120,
  storyTitle: 120,
  seoTitle: 60,
  metaDescription: 160,
  excerpt: 200,
  postSlug: 80,
  tagName: 60,
  postTags: 5,
  categoryName: 80,
  categorySlug: 100,
  reviewNote: 500,
  authorName: 120,
  authorBio: 500,
  settingSiteName: 120,
  settingTagline: 200,
  settingEmail: 190,
  settingBusinessName: 160,
  settingAddress: 1000,
  settingTimezone: 80,
  settingFooterBlurb: 500,
  settingsBlocklistWord: 80,
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
export const ADMIN_WRITE_LIMIT = Object.freeze({ hits: 120, windowMs: 60_000 });
export const ADMIN_LIST_PAGE_SIZE = 20;
export const PUBLIC_CONTENT_LIMITS = Object.freeze({
  home: 10,
  archive: 12,
  search: 20,
  featured: 3,
  editorPicks: 3,
  popularPosts: 5,
  popularCategories: 8,
  relatedCandidates: 60,
  relatedPosts: 4,
  searchMin: 2,
  searchMax: 80,
  searchPerMinute: 30,
  searchWindowMs: 60_000,
  publicPageCacheMs: 60_000,
  sidebarCacheMs: 60 * 60 * 1000,
  relatedCacheMs: 60 * 60 * 1000,
  viewPerMinute: 60,
  viewWindowMs: 60_000,
});
export const MEDIA_UPLOAD_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  rate: { hits: 30, windowMs: 60 * 60 * 1000 },
  maxWidth: 2000,
  variants: [400, 800, 1200],
  listPageSize: 60,
  pickerPageSize: 30,
});

export const HTTP_STATUS = Object.freeze({
  ok: 200,
  serviceUnavailable: 503,
});
