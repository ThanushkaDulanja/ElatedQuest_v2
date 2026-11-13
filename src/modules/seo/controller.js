import { rssXml, sitemapXml } from "./metadata.js";

export function createSeoController(repository, { siteUrl, plausibleDomain = "" }) {
  return {
    async sitemap(_request, response, next) {
      try {
        const entries = await repository.sitemapEntries();
        const urls = [{ path: "/" }, ...entries];
        response.type("application/xml").set("Cache-Control", "no-cache").send(sitemapXml(urls.map((entry) => ({ url: new URL(entry.path, siteUrl).href, updatedAt: entry.updatedAt }))));
      } catch (error) { next(error); }
    },
    async robots(_request, response) {
      response.type("text/plain").send(`User-agent: *\nDisallow: /aadmin\nDisallow: /api\nSitemap: ${new URL("/sitemap.xml", siteUrl).href}\n`);
    },
    async feed(_request, response, next) {
      try {
        const [site, posts] = await Promise.all([repository.siteSettings(), repository.feedPosts()]);
        response.type("application/rss+xml").set("Cache-Control", "public, max-age=300").send(rssXml({ siteName: site.siteName || "Elated Quest", siteUrl, posts }));
      } catch (error) { next(error); }
    },
    analyticsDomain(_request, response, next) {
      response.locals.plausibleDomain = plausibleDomain;
      next();
    },
  };
}
