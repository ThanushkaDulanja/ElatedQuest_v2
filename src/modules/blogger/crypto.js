import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptRefreshToken(token, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptRefreshToken(value, key) {
  const [encodedIv, encodedTag, encodedData] = String(value ?? "").split(".");
  if (!encodedIv || !encodedTag || !encodedData) { throw new Error("The Blogger connection token is invalid."); }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedData, "base64url")), decipher.final()]).toString("utf8");
}
