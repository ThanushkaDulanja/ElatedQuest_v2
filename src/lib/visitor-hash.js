import { createHash } from "node:crypto";

export function visitorHash(ip, userAgent) {
  return createHash("sha256").update(`${process.env.HASH_SECRET ?? ""}\0${ip}\0${userAgent}`).digest("hex");
}
