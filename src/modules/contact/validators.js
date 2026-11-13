import { normalizeEmail } from "../../lib/email.js";

function clean(value, max, label, min = 0) {
  const text = String(value ?? "").replace(/\r\n?/gu, "\n").trim();
  if (text.length < min || text.length > max) { throw Object.assign(new Error(`Check the ${label} field.`), { status: 400 }); }
  return text;
}

function email(value) {
  const result = normalizeEmail(value);
  if (result.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result)) { throw Object.assign(new Error("Enter a valid email address."), { status: 400 }); }
  return result;
}

export function validateContact(input) {
  const type = input.type === "story" ? "story" : input.type === "message" ? "message" : null;
  if (!type) { throw Object.assign(new Error("Choose message or story."), { status: 400 }); }
  const name = clean(input.name, 80, "name", 1);
  const readerEmail = email(input.email);
  if (type === "message") { return { type, name, email: readerEmail, subject: clean(input.subject, 200, "subject"), message: clean(input.message, 3000, "message", 10) }; }
  const title = clean(input.title, 120, "title", 1);
  const body = clean(input.body, 20000, "story", 100);
  const links = clean(input.links, 5000, "story links");
  const linkLines = links.split("\n").map((line) => line.trim()).filter(Boolean);
  if (linkLines.length > 10) { throw Object.assign(new Error("Include no more than 10 link lines."), { status: 400 }); }
  if (linkLines.some((line) => { try { const url = new URL(line); return !["http:", "https:"].includes(url.protocol); } catch { return true; } })) { throw Object.assign(new Error("Each story link must be a full HTTP(S) URL."), { status: 400 }); }
  if (input.terms !== "on") { throw Object.assign(new Error("Accept the story terms before sending."), { status: 400 }); }
  return { type, name, email: readerEmail, title, body, links: linkLines };
}
