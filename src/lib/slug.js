import { RESERVED_SLUGS } from "../config/reserved-slugs.js";

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/-+$/u, "");
}

export async function buildUniqueSlug(title, repository, excludePostId = null) {
  const base = slugify(title) || "post";
  let candidate = base;
  let suffix = 2;
  while (RESERVED_SLUGS.includes(candidate) || await repository.slugInUse(candidate, excludePostId)) {
    const ending = `-${suffix++}`;
    candidate = `${base.slice(0, 80 - ending.length).replace(/-+$/u, "")}${ending}`;
  }
  return candidate;
}

export async function validatePostSlug(slug, repository, excludePostId = null) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 80) {throw new Error("Use a lowercase slug with letters, numbers, and hyphens (max 80 characters).");}
  if (RESERVED_SLUGS.includes(slug)) {throw new Error("That slug is reserved.");}
  if (await repository.pageSlugExists(slug) || await repository.slugInUse(slug, excludePostId)) {throw new Error("That slug is already in use.");}
  return slug;
}
