import { APP_LIMITS } from "../../config/constants.js";
import { isWithinLength } from "../../lib/validation.js";

export function validateDraftInput(input) {
  const fields = {
    title: String(input.title ?? "").trim(),
    slug: String(input.slug ?? "").trim(),
    excerpt: String(input.excerpt ?? "").trim(),
    content_html: String(input.content_html ?? ""),
    category_id: input.category_id ? Number(input.category_id) : null,
    tags: String(input.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    seo_title: String(input.seo_title ?? "").trim(),
    seo_description: String(input.seo_description ?? "").trim(),
    canonical_url: String(input.canonical_url ?? "").trim(),
    cover_media_id: input.cover_media_id ? Number(input.cover_media_id) : null,
    og_media_id: input.og_media_id ? Number(input.og_media_id) : null,
    allow_comments: input.allow_comments === "1" || input.allow_comments === "on" || input.allow_comments === true ? 1 : 0,
    confirm_slug_change: input.confirm_slug_change === "1" ? "1" : "",
  };
  for (const [key, limit] of [["title", APP_LIMITS.postTitle], ["slug", APP_LIMITS.postSlug], ["excerpt", APP_LIMITS.excerpt], ["seo_title", APP_LIMITS.seoTitle], ["seo_description", APP_LIMITS.metaDescription]]) {
    if (!isWithinLength(fields[key], limit)) {throw new Error(`${key.replaceAll("_", " ")} must be at most ${limit} characters.`);}
  }
  if (fields.tags.length > APP_LIMITS.postTags) {throw new Error(`Choose no more than ${APP_LIMITS.postTags} tags.`);}
  if (fields.tags.some((tag) => !isWithinLength(tag, APP_LIMITS.tagName))) {throw new Error(`Each tag must be at most ${APP_LIMITS.tagName} characters.`);}
  if (fields.canonical_url && !/^https?:\/\//iu.test(fields.canonical_url)) {throw new Error("Canonical URL must begin with http:// or https://.");}
  for (const key of ["category_id", "cover_media_id", "og_media_id"]) {
    if (fields[key] !== null && (!Number.isSafeInteger(fields[key]) || fields[key] < 1)) {throw new Error(`${key.replaceAll("_", " ")} must be a positive whole number.`);}
  }
  return fields;
}

export function validateCategory(input) {
  const name = String(input.name ?? "").trim();
  const slug = String(input.slug ?? "").trim().toLowerCase();
  const description = String(input.description ?? "").trim();
  const sort_order = Number.parseInt(input.sort_order ?? "0", 10);
  if (!name || name.length > APP_LIMITS.categoryName) {throw new Error("Category name is required and must be at most 80 characters.");}
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > APP_LIMITS.categorySlug) {throw new Error("Use a lowercase category slug with letters, numbers, and hyphens.");}
  if (description.length > 300) {throw new Error("Category description must be at most 300 characters.");}
  if (!Number.isSafeInteger(sort_order)) {throw new Error("Sort order must be a whole number.");}
  return { name, slug, description: description || null, sort_order, show_in_nav: input.show_in_nav === "1" || input.show_in_nav === "on" ? 1 : 0 };
}
