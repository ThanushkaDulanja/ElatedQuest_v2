import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "br", "h2", "h3", "h4", "strong", "em", "u", "s", "blockquote", "ul", "ol", "li", "a", "img", "figure", "figcaption", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td"];
const allowedAttributes = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading", "data-image-size"],
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
};

export function sanitizePostHtml(html, uploadsPublicUrl = process.env.UPLOADS_PUBLIC_URL || "/uploads/") {
  const prefix = uploadsPublicUrl.endsWith("/") ? uploadsPublicUrl : `${uploadsPublicUrl}/`;
  return sanitizeHtml(String(html ?? ""), {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https?:\/\//iu.test(href);
        const allowed = external || /^mailto:/iu.test(href);
        const safeAttribs = { ...attribs };
        if (!allowed) {delete safeAttribs.href;}
        if (external) {safeAttribs.rel = "noopener noreferrer";}
        return { tagName, attribs: safeAttribs };
      },
      img: (tagName, attribs) => {
        const safeAttribs = { ...attribs };
        if (!["small", "medium", "full"].includes(safeAttribs["data-image-size"])) { delete safeAttribs["data-image-size"]; }
        return { tagName, attribs: safeAttribs };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && (!frame.attribs.alt?.trim() || !(frame.attribs.src ?? "").startsWith(prefix)),
  });
}

export function htmlToPlainText(html) {
  return sanitizeHtml(String(html ?? ""), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
