import { PUBLIC_CONTENT_LIMITS } from "../../config/constants.js";
import { createHash } from "node:crypto";

function createLimiter({ hits, windowMs, now = Date.now, bypassBots = false, json = false, repository, namespace = "public" }) {
  const requests = new Map();
  return async function publicRateLimit(request, response, next) {
    if (bypassBots && /bot|crawl|spider|slurp|preview|headless/iu.test(request.get("user-agent") ?? "")) { return next(); }
    const timestamp = now();
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    if (repository) {
      try {
        const addressHash = createHash("sha256").update(key).digest("hex");
        const result = await repository.incrementRateLimit(`${namespace}:${addressHash}`, hits, windowMs);
        if (!result.allowed) {
          response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
          return json ? response.status(429).json({ error: "Too many requests." }) : response.status(429).send("Too many searches. Try again soon.");
        }
        return next();
      } catch (error) { return next(error); }
    }
    const recent = (requests.get(key) ?? []).filter((time) => timestamp - time < windowMs);
    if (recent.length >= hits) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      return json ? response.status(429).json({ error: "Too many requests." }) : response.status(429).send("Too many searches. Try again soon.");
    }
    recent.push(timestamp);
    requests.set(key, recent);
    if (requests.size > 1000) {
      for (const [address, times] of requests) { if (!times.some((time) => timestamp - time < windowMs)) { requests.delete(address); } }
    }
    return next();
  };
}

export function createPublicSearchLimit(options = {}) {
  return createLimiter({ hits: PUBLIC_CONTENT_LIMITS.searchPerMinute, windowMs: PUBLIC_CONTENT_LIMITS.searchWindowMs, namespace: "search", ...options });
}

export function createPublicViewLimit(options = {}) {
  return createLimiter({ hits: PUBLIC_CONTENT_LIMITS.viewPerMinute, windowMs: PUBLIC_CONTENT_LIMITS.viewWindowMs, bypassBots: true, json: true, namespace: "view", ...options });
}
