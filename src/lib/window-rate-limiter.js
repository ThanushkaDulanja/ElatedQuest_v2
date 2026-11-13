import { createHash } from "node:crypto";

export function createWindowRateLimiter(limit, windowMs, now = () => Date.now()) {
  const windows = new Map();
  return {
    allow(key) {
      const timestamp = now();
      const samples = (windows.get(key) ?? []).filter((value) => timestamp - value < windowMs);
      if (samples.length >= limit) { windows.set(key, samples); return false; }
      samples.push(timestamp);
      windows.set(key, samples);
      return true;
    },
  };
}
export function createPersistentRateLimiter(repository, limit, windowMs, namespace) {
  return {
    async allow(key, bucket = "") {
      const digest = createHash("sha256").update(String(key)).digest("hex");
      const result = await repository.incrementRateLimit(`${namespace}${bucket ? `:${bucket}` : ""}:${digest}`, limit, windowMs);
      return result.allowed;
    },
  };
}
