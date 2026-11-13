import { normalizeEmail } from "../../lib/email.js";

export function validateInviteEmail(value) {
  const email = normalizeEmail(value);
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {throw new Error("Enter a valid email address.");}
  return email;
}
