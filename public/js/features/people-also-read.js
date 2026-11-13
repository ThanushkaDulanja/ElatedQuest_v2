const READ_KEY = "readPosts";

function readIds() {
  try { const value = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"); return new Set(Array.isArray(value) ? value.map(String) : []); }
  catch { return new Set(); }
}

function link(href, text) { const node = document.createElement("a"); node.href = href; node.textContent = text; return node; }

function imageLink(post, className) {
  const anchor = link(`/${encodeURIComponent(post.slug)}`, "");
  anchor.className = className;
  anchor.setAttribute("aria-label", `Read ${post.title}`);
  if (post.cover_url) { const image = document.createElement("img"); image.src = post.cover_url; if (post.cover_srcset) { image.srcset = post.cover_srcset; image.sizes = post.cover_sizes || "(min-width: 1024px) 405px, 100vw"; } image.alt = post.cover_alt ?? ""; image.width = post.cover_width || 800; image.height = post.cover_height || 450; image.loading = "lazy"; anchor.append(image); }
  else { const placeholder = document.createElement("span"); placeholder.className = "public-card__placeholder"; placeholder.setAttribute("aria-hidden", "true"); anchor.append(placeholder); }
  return anchor;
}

function formatDate(value) {
  if (!value) { return ""; }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function lead(post) {
  const article = document.createElement("article"); article.className = "public-home-lead";
  article.append(imageLink(post, "public-home-lead__image-link"));
  const body = document.createElement("div"); body.className = "public-home-lead__body";
  const heading = document.createElement("h2"); heading.append(link(`/${encodeURIComponent(post.slug)}`, post.title)); body.append(heading);
  const meta = document.createElement("p"); meta.className = "public-home-lead__meta";
  if (post.author_name) { const author = document.createElement("strong"); author.className = "public-home-lead__author"; author.textContent = post.author_name; meta.append(author); }
  if (post.author_name && post.published_at) { const separator = document.createElement("span"); separator.className = "public-home-lead__separator"; separator.textContent = "–"; meta.append(separator); }
  if (post.published_at) { const date = document.createElement("time"); date.className = "public-home-lead__date"; date.dateTime = post.published_at; date.textContent = formatDate(post.published_at); meta.append(date); }
  const comments = link(`/${encodeURIComponent(post.slug)}#comments`, String(post.comment_count ?? 0)); comments.className = "public-home-lead__comments"; comments.setAttribute("aria-label", `${post.comment_count ?? 0} comments`); meta.append(comments); body.append(meta);
  if (post.excerpt) { const excerpt = document.createElement("p"); excerpt.className = "public-home-lead__excerpt"; excerpt.textContent = post.excerpt; body.append(excerpt); }
  article.append(body); return article;
}

function mini(post) {
  const article = document.createElement("article"); article.className = "public-home-mini";
  article.append(imageLink(post, "public-home-mini__image-link"));
  const body = document.createElement("div"); body.className = "public-home-mini__body";
  const heading = document.createElement("h3"); heading.append(link(`/${encodeURIComponent(post.slug)}`, post.title)); body.append(heading);
  const meta = document.createElement("p"); meta.textContent = formatDate(post.published_at); body.append(meta); article.append(body); return article;
}

function uniquePosts(posts) { const seen = new Set(); return posts.filter((post) => { const id = String(post.id); if (seen.has(id)) { return false; } seen.add(id); return true; }); }

function fillSlots(posts, count = 18) {
  if (!posts.length) { return []; }
  const filled = posts.slice(0, count);
  const repeatPool = filled.length > 2 ? filled.slice(2) : filled;
  for (let index = 0; filled.length < count; index += 1) { filled.push(repeatPool[index % repeatPool.length]); }
  return filled;
}

export function init(section) {
  const leads = section.querySelector(".public-people-read__leads");
  const more = section.querySelector(".public-people-read__more");
  const tabs = [...section.querySelectorAll("[data-category]")];
  let allCandidates = [];
  try { const value = JSON.parse(section.dataset.candidates ?? "[]"); allCandidates = Array.isArray(value) ? value : []; } catch { allCandidates = []; }

  function render(posts) {
    const unread = uniquePosts(posts).filter((post) => !readIds().has(String(post.id)));
    const selected = fillSlots(unread);
    leads.replaceChildren(...selected.slice(0, 2).map(lead));
    more.replaceChildren(...selected.slice(2).map(mini));
    section.hidden = selected.length === 0;
  }

  render(allCandidates);
  for (const tab of tabs) {
    tab.addEventListener("click", async (event) => {
      event.preventDefault();
      const category = tab.dataset.category ?? "";
      try {
        const url = new URL("/api/posts/also-reading", location.origin);
        if (category) { url.searchParams.set("category", category); }
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) { throw new Error("Could not load recommendations."); }
        let candidates = await response.json();
        if (uniquePosts(candidates).filter((post) => !readIds().has(String(post.id))).length < 18 && category) {
          const fallback = await fetch("/api/posts/also-reading", { headers: { Accept: "application/json" } });
          if (fallback.ok) { allCandidates = await fallback.json(); candidates = [...candidates, ...allCandidates]; }
        }
        for (const linkNode of tabs) { if (linkNode === tab) { linkNode.setAttribute("aria-current", "page"); } else { linkNode.removeAttribute("aria-current"); } }
        render(candidates);
      } catch { location.assign(tab.href); }
    });
  }
}
