import { APP_LIMITS } from "../../config/constants.js";

export function validateMediaDetails(input) {
  const altText = String(input.alt_text ?? "").trim();
  const creditText = String(input.credit_text ?? "").trim();
  const creditUrl = String(input.credit_url ?? "").trim();
  if (Array.from(altText).length > 255) {throw new Error("Alt text must be 255 characters or fewer.");}
  if (Array.from(creditText).length > 255) {throw new Error("Credit text must be 255 characters or fewer.");}
  if (creditUrl) {
    let parsed;
    try { parsed = new URL(creditUrl); } catch { throw new Error("Credit link must be a valid http or https URL."); }
    if (!["http:", "https:"].includes(parsed.protocol)) {throw new Error("Credit link must use http or https.");}
  }
  return { altText: altText || null, creditText: creditText || null, creditUrl: creditUrl || null };
}

export function parsePage(value, pageSize) {
  const page = Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
  return { page, offset: (page - 1) * pageSize };
}

export function validatePickerQuery(value) {
  return String(value ?? "").trim().slice(0, APP_LIMITS.authorName);
}

export function detectMagicFormat(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {return "jpeg";}
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {return "png";}
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {return "webp";}
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {return "gif";}
  return null;
}
