export const AD_SECURITY_ORIGINS = Object.freeze({
  adsenseScript: "https://pagead2.googlesyndication.com",
  adsenseImages: ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com"],
  adsenseFrames: ["https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com"],
  adsenseConnect: ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net"],
});

export function buildContentSecurityPolicy({ nonce, uploadsOrigin, analytics = false, sentryOrigin = "", adsense = false, customImageOrigins = [] }) {
  const sources = (values) => values.length ? values.join(" ") : "'none'";
  return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}${analytics ? " https://plausible.io" : ""}${adsense ? ` ${AD_SECURITY_ORIGINS.adsenseScript}` : ""}`,
    "style-src 'self'",
    `img-src ${sources(["'self'", uploadsOrigin, ...(adsense ? AD_SECURITY_ORIGINS.adsenseImages : []), ...customImageOrigins])}`,
    `frame-src ${sources(adsense ? AD_SECURITY_ORIGINS.adsenseFrames : [])}`,
    `connect-src ${sources(["'self'", ...(analytics ? ["https://plausible.io"] : []), ...(sentryOrigin ? [sentryOrigin] : []), ...(adsense ? AD_SECURITY_ORIGINS.adsenseConnect : [])])}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
