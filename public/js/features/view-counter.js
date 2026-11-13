function rememberRead(postId) {
  try {
    const stored = JSON.parse(localStorage.getItem("readPosts") ?? "[]");
    const ids = Array.isArray(stored) ? stored.map(String).filter((id) => id !== postId) : [];
    localStorage.setItem("readPosts", JSON.stringify([postId, ...ids].slice(0, 200)));
  } catch { /* Storage can be unavailable in private browsing. */ }
}

export function init(element) {
  const postId = String(element.dataset.postId ?? "");
  if (!/^\d+$/u.test(postId)) { return; }
  const key = `viewed:${postId}`;
  try {
    if (sessionStorage.getItem(key)) { rememberRead(postId); return; }
    sessionStorage.setItem(key, "1");
  } catch { /* The counter still attempts a request if session storage is unavailable. */ }

  let sent = false;
  try { sent = navigator.sendBeacon?.(`/api/posts/${encodeURIComponent(postId)}/view`) ?? false; } catch { /* Fall back to fetch. */ }
  if (!sent) {
    void fetch(`/api/posts/${encodeURIComponent(postId)}/view`, { method: "POST", keepalive: true, credentials: "omit" }).catch(() => {});
  }
  rememberRead(postId);
}
