const entries = new Map();
const CACHE_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

export function get(key) {
  const entry = entries.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return undefined;
  }
  return entry.value;
}

export function set(key, value, ttlMs = CACHE_TTL_MS) {
  entries.delete(key);
  entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (entries.size > MAX_ENTRIES) { entries.delete(entries.keys().next().value); }
  return value;
}

export function del(key) { return entries.delete(key); }

export function delPrefix(prefix) {
  let count = 0;
  for (const key of entries.keys()) { if (key.startsWith(prefix)) { entries.delete(key); count += 1; } }
  return count;
}

export function clear() { entries.clear(); }

export function invalidate(key) {
  if (key === undefined) { clear(); }
  else if (key === "home") {
    delPrefix("html:");
    delPrefix("sidebar:");
    delPrefix("related:");
    del(key);
  } else if (key === "site:") {
    delPrefix("site:");
    delPrefix("html:");
    delPrefix("sidebar:");
    delPrefix("related:");
  } else if (key.startsWith("post:")) {
    const slug = key.slice("post:".length);
    del(key);
    del(`html:/${slug}`);
    delPrefix(`html:/${slug}?`);
  } else if (key.endsWith(":")) { delPrefix(key); }
  else { del(key); }
}
