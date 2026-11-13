const KEY = "elatedquest.savedStories";

function readSaved() {
  try { const rows = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(rows) ? rows.slice(0, 50) : []; }
  catch { return []; }
}

export async function init(container) {
  const saved = readSaved();
  const message = container.querySelector("[data-saved-empty]");
  const list = container.querySelector("[data-saved-list]");
  if (!saved.length) { message.hidden = false; return; }
  const ids = saved.map((item) => String(item.id)).filter((id) => /^\d+$/u.test(id));
  if (!ids.length) { message.hidden = false; return; }
  try {
    const response = await fetch(`/api/posts/by-ids?ids=${encodeURIComponent(ids.join(","))}`, { headers: { Accept: "application/json" } });
    if (!response.ok) { throw new Error("Could not load saved stories."); }
    const posts = await response.json();
    for (const post of posts) {
      const article = document.createElement("article"); article.className = "public-home-card";
      const imageLink = document.createElement("a"); imageLink.className = "public-home-card__image-link"; imageLink.href = `/${encodeURIComponent(post.slug)}`;
      if (post.cover_url) { const image = document.createElement("img"); image.src = post.cover_url; image.alt = post.cover_alt ?? ""; image.width = post.cover_width || 800; image.height = post.cover_height || 450; image.loading = "lazy"; imageLink.append(image); }
      else { const placeholder = document.createElement("span"); placeholder.className = "public-card__placeholder"; imageLink.append(placeholder); }
      const body = document.createElement("div"); body.className = "public-home-card__body";
      const title = document.createElement("h3"); const titleLink = document.createElement("a"); titleLink.href = imageLink.href; titleLink.textContent = post.title; title.append(titleLink); body.append(title);
      const excerpt = document.createElement("p"); excerpt.className = "public-home-card__excerpt"; excerpt.textContent = post.excerpt ?? ""; body.append(excerpt);
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => {
        try { localStorage.setItem(KEY, JSON.stringify(readSaved().filter((item) => String(item.id) !== String(post.id)))); article.remove(); if (!list.children.length) { message.hidden = false; } }
        catch { remove.textContent = "Unable to remove"; }
      }); body.append(remove); article.append(imageLink, body); list.append(article);
    }
    message.hidden = list.children.length > 0;
  } catch { message.textContent = "Saved stories could not be loaded. Refresh to try again."; message.hidden = false; }
}
