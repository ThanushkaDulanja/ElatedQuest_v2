import { PUBLIC_CONTENT_LIMITS } from "../../config/constants.js";
import { get, set } from "../../lib/cache.js";

const SESSION_COOKIE = /(?:^|;\s*)elatedquest\.sid=/u;

function pageCacheEnabled() {
  if (process.env.PAGE_CACHE === "off") { return false; }
  if (process.env.PAGE_CACHE === "on") { return true; }
  return process.env.NODE_ENV !== "development";
}

export function publicHtmlCacheKey(request) {
  const query = new URLSearchParams();
  for (const key of Object.keys(request.query ?? {}).sort()) {
    const value = request.query[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) { query.append(key, String(item)); }
    }
  }
  query.sort();
  const serialized = query.toString();
  return `html:${request.path}${serialized ? `?${serialized}` : ""}`;
}

export function publicPageCache(request, response, next) {
  if (!pageCacheEnabled()) {
    response.set("Cache-Control", "no-store");
    return next();
  }
  if (SESSION_COOKIE.test(request.headers.cookie ?? "")) {
    response.set("Cache-Control", "no-store");
    return next();
  }
  const key = publicHtmlCacheKey(request);
  const cached = get(key);
  if (cached !== undefined) {
    response.set("Cache-Control", "public, max-age=0, must-revalidate");
    return response.type("html").send(cached);
  }
  request.publicHtmlCacheKey = key;
  response.set("Cache-Control", "public, max-age=0, must-revalidate");
  return next();
}

export function tryServeCachedPublicHtml(request, response) {
  if (!pageCacheEnabled()) { return false; }
  if (SESSION_COOKIE.test(request.headers.cookie ?? "")) { return false; }
  const cached = get(publicHtmlCacheKey(request));
  if (cached === undefined) { return false; }
  response.set("Cache-Control", "public, max-age=0, must-revalidate");
  response.type("html").send(cached);
  return true;
}

export function renderPublicHtml(request, response, view, data, next) {
  const hasAdminSession = SESSION_COOKIE.test(request.headers.cookie ?? "");
  if (hasAdminSession) {
    response.set("Cache-Control", "no-store");
    return response.render(view, data, (error, html) => {
      if (error) { return next(error); }
      return response.type("html").send(html);
    });
  }

  if (!pageCacheEnabled()) {
    response.set("Cache-Control", "no-store");
    return response.render(view, data, (error, html) => {
      if (error) { return next(error); }
      return response.type("html").send(html);
    });
  }

  const key = request.publicHtmlCacheKey ?? publicHtmlCacheKey(request);
  response.set("Cache-Control", "public, max-age=0, must-revalidate");
  if (!request.publicHtmlCacheKey) {
    const cached = get(key);
    if (cached !== undefined) { return response.type("html").send(cached); }
  }
  return response.render(view, data, (error, html) => {
    if (error) { return next(error); }
    if (response.statusCode === 200) { set(key, html, PUBLIC_CONTENT_LIMITS.publicPageCacheMs); }
    return response.type("html").send(html);
  });
}
