import { safePublicUrl } from "./service.js";
import { articleSchema, breadcrumbSchema, personSchema, safeJsonLd, websiteSchema } from "../seo/metadata.js";

function absoluteUrl(value, base) {
  const source = String(value ?? "").trim();
  if (!source) { return ""; }
  try { const parsed = new URL(source, base); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : ""; }
  catch { return ""; }
}
import { renderPublicHtml, tryServeCachedPublicHtml } from "./renderCache.js";

export function createSiteController({ service, authorsService = { async publicTeam() { return []; } }, postsService, commentsService, adsService = { async publicSettings() { return { enabled: false, slots: {} }; } }, siteUrl = process.env.SITE_URL ?? "http://localhost:3000" }) {
  const base = async (pathname, title, description = "", robots = "index,follow") => ({
    site: await service.siteData(), ads: await adsService.publicSettings(), title, description, robots,
    canonical: new URL(pathname, siteUrl).href,
    currentYear: new Date().getUTCFullYear(),
  });
  async function notFound(_request, response, next) {
    try {
      const data = await service.page404Data();
      response.set({ "X-Robots-Tag": "noindex", "Cache-Control": "no-store" });
      response.status(404).render("public/404.njk", { ...data, title: `Page not found – ${data.site.general.siteName}`, description: "We couldn't find that page.", canonical: null, robots: "noindex,follow", currentYear: new Date().getUTCFullYear() });
    } catch (error) { next(error); }
  }

  return {
    async home(_request, response, next) {
      try {
        const site = await service.siteData();
        const page = service.normalizePage(_request.query.page);
        const data = await service.homeData(page, Number(_request.query.popularDays) === 30 ? 30 : 7);
        if (!data) { return notFound(_request, response, next); }
        const pagePath = "/";
        return renderPublicHtml(_request, response, "public/home.njk", { ...data, ads: await adsService.publicSettings(response, ["home_feed", "home_sidebar"]), isOwner: _request.user?.role === "owner", alsoReadingJson: JSON.stringify(data.alsoReadingCandidates), site, isHomePage: true, pagePath, title: site.general.tagline ? `${site.general.siteName} – ${site.general.tagline}` : site.general.siteName, description: site.general.tagline, ogImage: absoluteUrl(site.general.socialImage, siteUrl), structuredData: [safeJsonLd(websiteSchema({ name: site.general.siteName, url: new URL("/", siteUrl).href }))], canonical: new URL(page > 1 ? `/?page=${page}` : "/", siteUrl).href, prevUrl: page > 1 ? new URL(`/?page=${page - 1}`, siteUrl).href : null, nextUrl: page < data.pageCount ? new URL(`/?page=${page + 1}`, siteUrl).href : null, robots: "index,follow", currentYear: new Date().getUTCFullYear() }, next);
      } catch (error) { next(error); }
    },
    async archive(request, response, next) {
      try {
        const { kind, slug } = request.params;
        const page = service.normalizePage(request.query.page);
        const data = await service.archive(kind, slug, page);
        if (!data) { return notFound(request, response, next); }
        const site = await service.siteData();
        const pathname = `/${kind}/${slug}`;
        const titleText = kind === "author" ? data.record.name : data.record.name;
        const title = `${titleText} – ${site.general.siteName}`;
        const description = kind === "category" ? data.record.description ?? "" : kind === "author" ? data.record.bio ?? "" : "Stories tagged " + data.record.name;
        const canonical = new URL(page > 1 ? `${pathname}?page=${page}` : pathname, siteUrl).href;
        const structuredData = kind === "category" ? [safeJsonLd(breadcrumbSchema([{ name: "Home", url: new URL("/", siteUrl).href }, { name: data.record.name, url: new URL(pathname, siteUrl).href }]))] : kind === "author" ? [safeJsonLd(personSchema({ author: data.record, siteName: site.general.siteName, url: new URL(pathname, siteUrl).href, sameAs: site.footerSocial.map((item) => item.href) }))] : [];
        const viewData = { ...data, site, ads: await adsService.publicSettings(response, ["home_feed"]), isOwner: request.user?.role === "owner", kind, title, description, ogImage: absoluteUrl(site.general.socialImage, siteUrl), structuredData, canonical, prevUrl: page > 1 ? new URL(`${pathname}?page=${page - 1}`, siteUrl).href : null, nextUrl: page < data.pageCount ? new URL(`${pathname}?page=${page + 1}`, siteUrl).href : null, robots: data.noindex ? "noindex,follow" : "index,follow", currentYear: new Date().getUTCFullYear() };
        if (kind === "category" || kind === "author") { return renderPublicHtml(request, response, "public/archive.njk", viewData, next); }
        response.set("Cache-Control", "no-store");
        return response.render("public/archive.njk", viewData);
      } catch (error) { next(error); }
    },
    async search(request, response, next) {
      try {
        const data = await service.search(request.query.q, request.query.page);
        if (data === null) { return notFound(request, response, next); }
        const site = await service.siteData();
        const query = data.query;
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.render("public/search.njk", { ...data, site, title: `Search – ${site.general.siteName}`, description: "Search stories", canonical: new URL("/search", siteUrl).href, robots: "noindex,follow", currentYear: new Date().getUTCFullYear(), prevUrl: data.page > 1 ? new URL(`/search?q=${encodeURIComponent(query)}&page=${data.page - 1}`, siteUrl).href : null, nextUrl: data.page < data.pageCount ? new URL(`/search?q=${encodeURIComponent(query)}&page=${data.page + 1}`, siteUrl).href : null });
      } catch (error) { next(error); }
    },
    async searchApi(request, response, next) {
      try {
        const data = await service.search(request.query.q, request.query.page);
        if (data === null) { return response.status(404).json({ error: "Page not found." }); }
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.json({ query: data.query, valid: data.valid, page: data.page, pageCount: data.pageCount ?? 1, total: data.total, results: data.results.map(({ id, title, slug, excerpt, category_name, category_slug, author_name, published_at, titleHtml, snippetHtml }) => ({ id, title, slug, excerpt, category_name, category_slug, author_name, published_at, titleHtml, snippetHtml })) });
      } catch (error) { next(error); }
    },
    async alsoReading(request, response, next) {
      try {
        const posts = await service.alsoReading(request.query.category || null);
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.json(posts);
      } catch (error) { next(error); }
    },
    async postsApi(request, response, next) {
      try {
        const data = await service.postsApi(request.query.category || null, request.query.page);
        if (!data) { return response.status(404).json({ error: "Page not found." }); }
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.json(data);
      } catch (error) { next(error); }
    },
    async popularApi(request, response, next) {
      try {
        const posts = await service.popularPosts(request.query.days);
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.json(posts);
      } catch (error) { next(error); }
    },
    async savedApi(request, response, next) {
      try {
        const ids = String(request.query.ids ?? "").split(",").slice(0, 50);
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.json(await service.savedPosts(ids));
      } catch (error) { next(error); }
    },
    async saved(_request, response, next) {
      try {
        const site = await service.siteData();
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        return response.render("public/saved.njk", { site, title: `Saved stories – ${site.general.siteName}`, description: "Stories saved on this device.", canonical: null, robots: "noindex,follow", currentYear: new Date().getUTCFullYear() });
      } catch (error) { next(error); }
    },
    async random(_request, response, next) {
      try {
        const slug = await service.randomPost();
        if (!slug) { return response.redirect(302, "/"); }
        return response.redirect(302, `/${encodeURIComponent(slug)}`);
      } catch (error) { next(error); }
    },
    async thankYou(_request, response, next) {
      try {
        const site = await service.siteData();
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        return response.render("public/thank-you.njk", { site, title: `Thank you – ${site.general.siteName}`, description: "Thank you for getting in touch.", canonical: null, robots: "noindex,follow", currentYear: new Date().getUTCFullYear() });
      } catch (error) { next(error); }
    },
    async view(request, response, next) {
      const userAgent = request.get("user-agent") ?? "";
      if (/bot|crawl|spider|slurp|preview|headless/iu.test(userAgent)) { return response.status(204).end(); }
      const originOrReferer = request.get("origin") || request.get("referer");
      let requestOrigin;
      try { requestOrigin = new URL(originOrReferer).origin; } catch { return response.status(403).json({ error: "A same-origin request is required." }); }
      if (requestOrigin !== new URL(siteUrl).origin) { return response.status(403).json({ error: "A same-origin request is required." }); }
      try {
        const result = await service.recordView(request.params.id, userAgent);
        if (!result.counted) { return response.status(404).json({ error: "Post not found." }); }
        return response.status(204).end();
      } catch (error) { return next(error); }
    },
    async slug(request, response, next) {
      try {
        if (tryServeCachedPublicHtml(request, response)) { return; }
        const requestedUrl = new URL(request.originalUrl, siteUrl);
        const requestedSlug = request.params.slug;
        const canonicalSlug = requestedSlug.toLowerCase();
        if (canonicalSlug !== requestedSlug || requestedUrl.pathname.endsWith("/")) {
          return response.redirect(301, `/${encodeURIComponent(canonicalSlug)}${requestedUrl.search}`);
        }
        const resolved = await service.resolveSlug(canonicalSlug);
        if (resolved.type === "redirect") { return response.redirect(301, `/${encodeURIComponent(resolved.target)}`); }
        if (resolved.type === "page") {
          const data = await base(`/${canonicalSlug}`, `${resolved.page.title} – ${(await service.siteData()).general.siteName}`);
          const aboutAuthors = canonicalSlug === "about-us" ? await authorsService.publicTeam() : [];
          return response.render("public/page.njk", { ...data, aboutAuthors, page: resolved.page, ogImage: absoluteUrl(data.site.general.socialImage, siteUrl) });
        }
        if (resolved.type === "post") {
          const data = await service.postPage(canonicalSlug);
          const site = await service.siteData();
          const page = data.post;
          if (!page) { return notFound(request, response, next); }
          const metaTitle = page.seo_title || `${page.title} – ${site.general.siteName}`;
          const metaDescription = page.seo_description || page.excerpt || "";
          const content = await postsService.publicContent(page.id, page.content_html);
          const comments = commentsService ? await commentsService.list(page.id, request.query.commentSort) : [];
          const canComment = commentsService?.canComment ? await commentsService.canComment(page.id) : Boolean(page.allow_comments);
          const author = { ...page, display_name: page.author_name, slug: page.author_slug, avatar_url: page.author_avatar_url, initials: String(page.author_name ?? "?").split(/\s+/u).map((part) => part[0]).join("").slice(0, 2).toUpperCase() };
          const coverCreditUrl = safePublicUrl(page.cover_credit_url);
          const canonical = new URL(`/${canonicalSlug}`, siteUrl).href;
          const url = encodeURIComponent(canonical);
          const title = encodeURIComponent(page.title);
          const image = encodeURIComponent(page.cover_url ?? "");
          const shareTemplates = { facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`, x: `https://x.com/intent/post?text=${title}&url=${url}`, pinterest: `https://pinterest.com/pin/create/button/?url=${url}&media=${image}&description=${title}`, whatsapp: `https://api.whatsapp.com/send?text=${title}%20${url}`, linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}`, reddit: `https://reddit.com/submit?url=${url}&title=${title}`, telegram: `https://t.me/share/url?url=${url}&text=${title}`, email: `mailto:?subject=${title}&body=${url}` };
          const shareLinks = (site.shareNetworks ?? []).filter((network) => network === "copy" || shareTemplates[network]).map((network) => ({ network, href: shareTemplates[network] ?? "#" }));
          const paragraphEnds = [...content.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/giu)].map((match) => match.index + match[0].length);
          const afterThird = paragraphEnds.length >= 6 ? paragraphEnds[2] : -1;
          const ads = await adsService.publicSettings(response, ["post_after_p3", "post_end", "post_sidebar"]);
          const canShowP3 = !request.previewMode && afterThird >= 0 && ads.enabled && ads.slots.post_after_p3?.enabled;
          const structuredData = [safeJsonLd(articleSchema({ post: page, siteName: site.general.siteName, url: canonical, image: absoluteUrl(page.cover_url || site.general.socialImage, siteUrl) })), safeJsonLd(breadcrumbSchema([{ name: "Home", url: new URL("/", siteUrl).href }, ...(page.category_slug ? [{ name: page.category_name, url: new URL(`/category/${page.category_slug}`, siteUrl).href }] : []), { name: page.title, url: canonical }]))];
          return renderPublicHtml(request, response, "public/post.njk", { ...data, ads, isOwner: request.user?.role === "owner", post: page, author, content: canShowP3 ? content.slice(0, afterThird) : content, contentAfterP3: canShowP3 ? content.slice(afterThird) : "", showPostAfterP3: canShowP3, previewMode: Boolean(request.previewMode), comments, canComment, commentSort: request.query.commentSort || "newest", commentNotice: request.query.comment, ratingNotice: request.query.rated === "1", shareLinks, canonical, ogImage: absoluteUrl(page.cover_url || site.general.socialImage, siteUrl), structuredData, coverCreditUrl, title: metaTitle, description: metaDescription, robots: "index,follow", currentYear: new Date().getUTCFullYear() }, next);
        }
        return notFound(request, response, next);
      } catch (error) { next(error); }
    },
    notFound,
    async error(error, request, response, next) {
      if (request.path.startsWith("/aadmin") || request.path.startsWith("/api/admin") || request.path.startsWith("/auth")) { return next(error); }
      if (response.headersSent) { return next(error); }
      if (process.env.NODE_ENV !== "production") {
        const stack = String(error?.stack ?? "").split(/\r?\n/u).slice(1, 3).join(" ").slice(0, 500);
        console.error(`[request ${request.requestId}] ${error?.name ?? "Error"} ${error?.code ?? ""} ${stack}`);
      }
      try {
        const site = await service.siteData();
        response.status(error.status === 403 ? 403 : 500).set({ "X-Robots-Tag": "noindex", "Cache-Control": "no-store" });
        return response.render("public/error.njk", { site, title: `Something went wrong – ${site.general.siteName}`, description: "", canonical: null, robots: "noindex", status: error.status === 403 ? 403 : 500, requestId: request.requestId, currentYear: new Date().getUTCFullYear() });
      } catch { return next(error); }
    },
  };
}
