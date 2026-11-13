import { APP_LIMITS } from "../../config/constants.js";

export function validateAuthor(input) {
  const displayName = String(input.display_name ?? "").trim();
  const bio = String(input.bio ?? "").trim();
  const showOnAbout = input.show_on_about === "1" || input.show_on_about === "on" ? 1 : 0;
  if (!displayName || Array.from(displayName).length > APP_LIMITS.authorName) {throw new Error("Display name is required and must be 120 characters or fewer.");}
  if (Array.from(bio).length > APP_LIMITS.authorBio) {throw new Error("Bio must be 500 characters or fewer.");}
  const avatarMediaId = input.avatar_media_id ? Number(input.avatar_media_id) : null;
  if (avatarMediaId !== null && (!Number.isSafeInteger(avatarMediaId) || avatarMediaId < 1)) {throw new Error("Choose a valid avatar image.");}
  return { displayName, bio: bio || null, avatarMediaId, showOnAbout };
}

export function authorSlug(value) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  if (!slug) {throw new Error("Display name must contain letters or numbers.");}
  return slug;
}
