import { delPrefix, get, set } from "../../lib/cache.js";
import { sanitizePostHtml } from "../../lib/sanitize.js";
import { RESERVED_SLUGS } from "../../config/reserved-slugs.js";
import { PUBLIC_CONTENT_LIMITS } from "../../config/constants.js";
import { mediaSrcset } from "../media/service.js";

const ICONS = new Set(["facebook", "instagram", "pinterest", "x", "youtube", "tiktok", "linkedin", "telegram", "whatsapp", "threads", "reddit"]);
const STATIC_PAGE_SLUGS = new Set(["about-us", "contact-us", "story-terms", "join-us", "privacy-policy", "image-use-policy", "dmca-removal", "terms"]);

function safeUrl(value, allowInternal = false) {
  const url = String(value ?? "").trim();
  if (!url || /[\\\u0000-\u001f]/u.test(url)) { return null; }
  if (allowInternal && url.startsWith("/") && !url.startsWith("//")) { return url; }
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function parsePage(value) {
  const candidate = String(value ?? "1");
  if (!/^\d+$/u.test(candidate)) { return 1; }
  const page = Number(candidate);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }

function enrichPost(post, uploadsPublicUrl) {
  if (!post) { return null; }
  const cover = post.cover_url ? { url_path: post.cover_url } : null;
  return { ...post, cover_url: post.cover_url ? `${uploadsPublicUrl.replace(/\/+$/u, "")}/${post.cover_url.replace(/^\/uploads\/?/u, "")}` : null, cover_srcset: cover ? mediaSrcset(cover, uploadsPublicUrl) : "", cover_sizes: "(min-width: 1024px) 640px, (min-width: 640px) 50vw, 100vw", author_avatar_url: post.author_avatar_url ? `${uploadsPublicUrl.replace(/\/+$/u, "")}/${post.author_avatar_url.replace(/^\/uploads\/?/u, "")}` : null };
}

function readerCard(post, uploadsPublicUrl) {
  const card = enrichPost(post, uploadsPublicUrl);
  return { id: card.id, title: card.title, slug: card.slug, excerpt: card.excerpt, category_name: card.category_name, category_slug: card.category_slug, author_name: card.author_name, published_at: card.published_at, comment_count: card.comment_count, cover_url: card.cover_url, cover_alt: card.cover_alt, cover_width: card.cover_width, cover_height: card.cover_height, cover_srcset: card.cover_srcset, cover_sizes: card.cover_sizes };
}

function alsoReadingCard(post, uploadsPublicUrl) {
  const card = readerCard(post, uploadsPublicUrl);
  let bodyText = String(post.content_text ?? "").trim();
  const savedExcerpt = String(post.excerpt ?? "").trim();
  if (savedExcerpt && bodyText.startsWith(savedExcerpt)) {
    bodyText = bodyText.slice(savedExcerpt.length).trim();
  }
  return { ...card, excerpt: bodyText || card.excerpt };
}

function fillRecommendationSlots(posts, slotCount = 18) {
  if (!posts.length) { return []; }
  const visible = posts.slice(0, slotCount);
  const repeatPool = visible.length > 2 ? visible.slice(2) : visible;
  for (let index = 0; visible.length < slotCount; index += 1) { visible.push(repeatPool[index % repeatPool.length]); }
  return visible;
}

function escapeLike(value) { return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_"); }

function searchMarkup(value, query) {
  const escaped = escapeHtml(value);
  const words = query.trim().split(/\s+/u).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!words.length) { return escaped; }
  const expression = new RegExp(`(${words.map((word) => escapeRegExp(escapeHtml(word))).join("|")})`, "giu");
  return escaped.replace(expression, "<mark>$1</mark>");
}

export function createSiteService(repository, { siteUrl = process.env.SITE_URL ?? "http://localhost:3000", uploadsPublicUrl = process.env.UPLOADS_PUBLIC_URL ?? "/uploads", pagesService, random = Math.random } = {}) {
  async function siteData() {
    const cached = get("site:data");
    if (cached) { return cached; }
    const [general, topMenu, headerMenu, footerMenu, rawSocial, categories, homeCategories, shareNetworks] = await Promise.all([
      repository.readSiteSettings(), repository.readMenus("top"), repository.readMenus("header"), repository.readMenus("footer"), repository.readSocialLinks(), repository.readNavigationCategories(), repository.readHomeCategories?.() ?? [], repository.readShareNetworks?.() ?? ["facebook", "x", "whatsapp", "email", "copy"],
    ]);
    const menu = (rows) => rows.flatMap((row) => { const href = safeUrl(row.url, true); return href ? [{ ...row, href, newTab: Boolean(row.open_in_new_tab) }] : []; });
    const social = rawSocial.flatMap((row) => {
      const href = safeUrl(row.url);
      if (!href) { return []; }
      return [{ ...row, href, icon: ICONS.has(String(row.platform).toLowerCase()) ? String(row.platform).toLowerCase() : "link", label: row.label || row.platform }];
    });
    const data = {
      general: { siteName: general.siteName || "Elated Quest", tagline: general.tagline || "", contactEmail: general.contactEmail || "", businessName: general.businessName || general.siteName || "Elated Quest", address: /^street,\s*city,\s*country$/iu.test(String(general.address ?? "").trim()) ? "" : general.address || "", footerBlurb: general.footerBlurb || "", socialImage: safeUrl(general.socialImage, true) ? new URL(safeUrl(general.socialImage, true), siteUrl).href : "", timezone: general.timezone || "UTC" },
      topMenu: menu(topMenu), headerMenu: menu(headerMenu), footerMenu: menu(footerMenu),
      topSocial: social.filter((row) => Boolean(row.show_in_top_bar)), footerSocial: social.filter((row) => Boolean(row.show_in_footer)), stayConnected: social.filter((row) => Boolean(row.show_in_stay_connected)), shareNetworks: Array.isArray(shareNetworks) ? shareNetworks : [],
      navCategories: categories.slice(0, 6), moreCategories: categories.slice(6),
      allCategories: categories, homeCategories,
    };
    return set("site:data", data, Infinity);
  }
  async function redirectTarget(startSlug) {
    const seen = new Set([startSlug]);
    let target = await repository.redirectBySlug(startSlug);
    if (!target) { return null; }
    for (let hops = 0; hops < 20; hops += 1) {
      if (seen.has(target)) { return null; }
      seen.add(target);
      if (await repository.postBySlug(target) || await repository.pageBySlug(target)) { return target; }
      const next = await repository.redirectBySlug(target);
      if (!next) { return null; }
      target = next;
    }
    return null;
  }
  return {
    safeUrl: safePublicUrl,
    siteData,
    clearSiteCache() { delPrefix("site:"); },
    async staticPage(slug) {
      const page = pagesService ? await pagesService.get(slug) : await repository.pageBySlug(slug);
      if (!page) { return null; }
      return { ...page, content_html: sanitizePostHtml(page.content_html) };
    },
    async resolveSlug(slug) {
      if (!/^[a-z0-9-]{1,100}$/u.test(slug) || (RESERVED_SLUGS.includes(slug) && !STATIC_PAGE_SLUGS.has(slug))) { return { type: "not_found" }; }
      const post = await repository.postBySlug(slug);
      if (post) { return { type: "post", post: { ...post, content_html: sanitizePostHtml(post.content_html) } }; }
      const page = await this.staticPage(slug);
      if (page) { return { type: "page", page }; }
      const target = await redirectTarget(slug);
      if (!target) { return { type: "not_found" }; }
      return { type: "redirect", target };
    },
    async page404Data() { return { site: await siteData(), newest: await repository.newestPublished(6) }; },
    async newestPublished(limit = 10) { return (await repository.newestPublished(limit)).map((post) => enrichPost(post, uploadsPublicUrl)); },
    async homeData(page, popularDays = 7) {
      const pageSize = PUBLIC_CONTENT_LIMITS.home;
      const featured = await repository.homeFeatured();
      const featureIds = [featured.featured, ...featured.companions].filter(Boolean).map((post) => post.id);
      const total = await repository.countPublishedAll();
      const pageCount = Math.max(1, Math.ceil(Math.max(0, total - featureIds.length) / pageSize));
      if (page > pageCount) { return null; }
      const latest = total ? await repository.homeLatest({ featuredIds: featureIds, offset: (page - 1) * pageSize, limit: pageSize }) : [];
      const sidebar = total ? await this.sidebar(popularDays) : { editorPicks: [], popularPosts: [], popularCategories: [] };
      const alsoReadingCandidates = page === 1 && repository.alsoReadingCandidates ? await repository.alsoReadingCandidates(null, 18) : [];
      return { featured: page === 1 ? enrichPost(featured.featured, uploadsPublicUrl) : null, companions: page === 1 ? featured.companions.map((post) => enrichPost(post, uploadsPublicUrl)) : [], alsoReadingCandidates: fillRecommendationSlots(alsoReadingCandidates).map((post) => alsoReadingCard(post, uploadsPublicUrl)), latest: latest.map((post) => enrichPost(post, uploadsPublicUrl)), sidebar, popularDays: popularDays === 30 ? 30 : 7, page, pageCount, total };
    },
    async sidebar(popularDays = 7) {
      const days = Number(popularDays) === 30 ? 30 : 7;
      const cacheKey = `sidebar:${days}`;
      const cached = get(cacheKey);
      if (cached) { return cached; }
      const [editorPicks, popularPosts, popularCategories] = await Promise.all([repository.sidebarEditorPicks(PUBLIC_CONTENT_LIMITS.editorPicks), repository.sidebarPopularPosts(PUBLIC_CONTENT_LIMITS.popularPosts, days), repository.sidebarPopularCategories(PUBLIC_CONTENT_LIMITS.popularCategories)]);
      const data = { editorPicks: editorPicks.map((post) => enrichPost(post, uploadsPublicUrl)), popularPosts: popularPosts.map((post) => enrichPost(post, uploadsPublicUrl)), popularCategories };
      set(cacheKey, data, PUBLIC_CONTENT_LIMITS.sidebarCacheMs);
      return data;
    },
    async alsoReading(categorySlug = null) {
      const slug = String(categorySlug ?? "").trim().toLowerCase();
      if (slug && !/^[a-z0-9-]{1,100}$/u.test(slug)) { return []; }
      const rows = await repository.alsoReadingCandidates?.(slug || null, 12) ?? [];
      return rows.map((post) => alsoReadingCard(post, uploadsPublicUrl));
    },
    async popularPosts(days = 7) {
      const safeDays = Number(days) === 30 ? 30 : 7;
      const rows = await repository.sidebarPopularPosts(PUBLIC_CONTENT_LIMITS.popularPosts, safeDays);
      return rows.map((post) => readerCard(post, uploadsPublicUrl));
    },
    async savedPosts(ids) {
      const safeIds = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 50);
      return (await repository.postsByIds?.(safeIds) ?? []).map((post) => readerCard(post, uploadsPublicUrl));
    },
    async postsApi(categorySlug = null, pageValue = 1) {
      const page = parsePage(pageValue);
      const limit = PUBLIC_CONTENT_LIMITS.home;
      const slug = String(categorySlug ?? "").trim().toLowerCase();
      if (slug) {
        if (!/^[a-z0-9-]{1,100}$/u.test(slug)) { return null; }
        const category = await repository.categoryBySlug(slug);
        if (!category) { return null; }
        const total = await repository.countCategory(category.id);
        const pageCount = Math.max(1, Math.ceil(total / limit));
        if (page > pageCount) { return null; }
        const posts = await repository.publishedCategoryPosts(category.id, (page - 1) * limit, limit);
        return { posts: posts.map((post) => readerCard(post, uploadsPublicUrl)), page, pageCount, total };
      }
      const featured = await repository.homeFeatured();
      const featuredIds = [featured.featured, ...featured.companions].filter(Boolean).map((post) => post.id);
      const total = Math.max(0, await repository.countPublishedAll() - featuredIds.length);
      const pageCount = Math.max(1, Math.ceil(total / limit));
      if (page > pageCount) { return null; }
      const posts = await repository.homeLatest({ featuredIds, offset: (page - 1) * limit, limit });
      return { posts: posts.map((post) => readerCard(post, uploadsPublicUrl)), page, pageCount, total };
    },
    async randomPost() { return repository.randomPublished?.() ?? null; },
    async postPage(slug) {
      const post = await repository.postDetailBySlug(slug);
      if (!post) { return null; }
      const [tags, sidebar] = await Promise.all([repository.postTags(post.id), this.sidebar()]);
      let related = get(`related:${post.id}`);
      if (!related) {
        const candidates = await repository.relatedCandidates(post.id, PUBLIC_CONTENT_LIMITS.relatedCandidates);
        const now = Date.now();
        related = candidates.map((candidate) => ({ candidate, score: (Number(candidate.category_id === post.category_id) * 3) + (Math.min(3, Number(candidate.shared_tag_count || 0)) * 2) + ((now - new Date(candidate.published_at).getTime() <= 30 * 86400000) ? 1 : 0) + random() * 0.5 })).sort((a, b) => b.score - a.score).slice(0, PUBLIC_CONTENT_LIMITS.relatedPosts).map(({ candidate }) => candidate);
        if (related.length < PUBLIC_CONTENT_LIMITS.relatedPosts) {
          const fallback = await repository.newestPublished(10);
          for (const item of fallback) { if (item.id !== post.id && !related.some((entry) => entry.id === item.id)) { related.push(item); } if (related.length === PUBLIC_CONTENT_LIMITS.relatedPosts) { break; } }
        }
        set(`related:${post.id}`, related, PUBLIC_CONTENT_LIMITS.relatedCacheMs);
      }
      return { post: enrichPost(post, uploadsPublicUrl), tags, related: related.map((item) => enrichPost(item, uploadsPublicUrl)), sidebar };
    },
    async previewData(postId) {
      const post = await repository.previewPostById(postId);
      if (!post) { return null; }
      const [tags, sidebar] = await Promise.all([repository.postTags(post.id), this.sidebar()]);
      return { post: enrichPost(post, uploadsPublicUrl), tags, related: [], sidebar };
    },
    async archive(kind, slug, page) {
      const pageSize = PUBLIC_CONTENT_LIMITS.archive;
      const lookup = kind === "category" ? repository.categoryBySlug : kind === "tag" ? repository.tagBySlug : repository.authorBySlug;
      const record = await lookup.call(repository, slug);
      if (!record) { return null; }
      if (kind === "author") { record.initials = String(record.name ?? "?").split(/\s+/u).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); record.avatar_url = record.avatar_url ? `${uploadsPublicUrl.replace(/\/+$/u, "")}/${record.avatar_url.replace(/^\/uploads\/?/u, "")}` : null; }
      const count = kind === "category" ? await repository.countCategory(record.id) : kind === "tag" ? await repository.countTag(record.id) : await repository.countAuthor(record.id);
      if (kind === "author" && count === 0) { return null; }
      const pageCount = Math.max(1, Math.ceil(count / pageSize));
      if (page > pageCount) { return null; }
      const listMethod = kind === "category" ? repository.categoryPosts : kind === "tag" ? repository.tagPosts : repository.authorPosts;
      const posts = await listMethod.call(repository, record.id, (page - 1) * pageSize, pageSize);
      const sidebar = kind === "category" ? null : await this.sidebar();
      return { record, count, posts: posts.map((post) => enrichPost(post, uploadsPublicUrl)), page, pageCount, sidebar, noindex: kind === "tag" && count < 3 };
    },
    async search(queryValue, pageValue) {
      const query = String(queryValue ?? "").trim();
      const page = parsePage(pageValue);
      if (query.length < PUBLIC_CONTENT_LIMITS.searchMin || query.length > PUBLIC_CONTENT_LIMITS.searchMax) { return { query, page, valid: false, total: 0, results: [] }; }
      const escapedQuery = escapeLike(query);
      let total = 0;
      let fallback = query.length < 3;
      let rows = [];
      if (!fallback) {
        total = await repository.countSearch(query, false);
        if (total === 0 && query.length === 2) { fallback = true; }
      }
      if (fallback) {
        const pattern = `%${escapedQuery}%`;
        total = await repository.countSearch(pattern, true);
        rows = await repository.searchTitleFallback(pattern, (page - 1) * PUBLIC_CONTENT_LIMITS.search, PUBLIC_CONTENT_LIMITS.search);
      } else {
        rows = await repository.searchPosts(query, (page - 1) * PUBLIC_CONTENT_LIMITS.search, PUBLIC_CONTENT_LIMITS.search);
      }
      const pageCount = Math.max(1, Math.ceil(total / PUBLIC_CONTENT_LIMITS.search));
      if (page > pageCount) { return null; }
      const results = rows.map((post) => {
        const text = String(post.content_text ?? post.excerpt ?? "");
        const matchIndex = text.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, matchIndex - 60);
        const snippet = `${start > 0 ? "…" : ""}${text.slice(start, start + 160)}${start + 160 < text.length ? "…" : ""}`;
        return { ...enrichPost(post, uploadsPublicUrl), titleHtml: searchMarkup(post.title, query), snippetHtml: searchMarkup(snippet, query) };
      });
      return { query, page, pageCount, valid: true, total, results, emptySidebar: total === 0 ? await this.sidebar() : null };
    },
    async recordView(postId, userAgent = "") {
      if (/bot|crawl|spider|slurp|preview|headless/iu.test(userAgent)) { return { counted: false, ignored: true }; }
      const id = Number(postId);
      if (!Number.isSafeInteger(id) || id < 1) { return { counted: false, ignored: false }; }
      const counted = await repository.incrementPublishedView(id);
      return { counted, ignored: false };
    },
    canonicalFor(pathname) { return new URL(pathname, siteUrl).href; },
    normalizePage: parsePage,
  };
}

export function safePublicUrl(value, allowInternal = false) { return safeUrl(value, allowInternal); }
