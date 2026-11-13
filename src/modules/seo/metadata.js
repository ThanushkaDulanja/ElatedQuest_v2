export function safeJsonLd(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

export function websiteSchema({ name, url }) {
  return { "@context": "https://schema.org", "@type": "WebSite", name, url, potentialAction: { "@type": "SearchAction", target: `${url.replace(/\/$/u, "")}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } };
}

export function articleSchema({ post, siteName, url, image }) {
  return { "@context": "https://schema.org", "@type": "Article", headline: post.seo_title || post.title, description: post.seo_description || post.excerpt || "", mainEntityOfPage: url, datePublished: new Date(post.published_at).toISOString(), ...(post.updated_at ? { dateModified: new Date(post.updated_at).toISOString() } : {}), author: { "@type": "Person", name: post.author_name, url: post.author_slug ? new URL(`/author/${post.author_slug}`, url).href : undefined }, publisher: { "@type": "Organization", name: siteName }, ...(image ? { image: [image] } : {}) };
}

export function breadcrumbSchema(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) };
}

export function personSchema({ author, siteName, url, sameAs = [] }) {
  return { "@context": "https://schema.org", "@type": "Person", name: author.name, description: author.bio || "", url, worksFor: { "@type": "Organization", name: siteName, ...(sameAs.length ? { sameAs } : {}) }, ...(author.avatar_url ? { image: author.avatar_url } : {}) };
}

export function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function sitemapXml(items) {
  const entries = items.map(({ url, updatedAt }) => `<url><loc>${xmlEscape(url)}</loc>${updatedAt ? `<lastmod>${xmlEscape(new Date(updatedAt).toISOString().slice(0, 10))}</lastmod>` : ""}</url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

export function rssXml({ siteName, siteUrl, posts }) {
  const items = posts.map((post) => `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(new URL(`/${post.slug}`, siteUrl).href)}</link><guid isPermaLink="true">${xmlEscape(new URL(`/${post.slug}`, siteUrl).href)}</guid><pubDate>${new Date(post.published_at).toUTCString()}</pubDate><description>${xmlEscape(post.excerpt)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(siteName)}</title><link>${xmlEscape(siteUrl)}</link><description>${xmlEscape(siteName)}</description>${items}</channel></rss>`;
}
