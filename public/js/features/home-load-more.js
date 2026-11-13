function makeImageLink(post) {
  const anchor = document.createElement("a"); anchor.className = "public-home-card__image-link"; anchor.href = `/${encodeURIComponent(post.slug)}`; anchor.setAttribute("aria-label", `Read ${post.title}`);
  if (post.cover_url) { const image = document.createElement("img"); image.src = post.cover_url; image.alt = post.cover_alt ?? ""; image.width = post.cover_width || 800; image.height = post.cover_height || 450; image.loading = "lazy"; anchor.append(image); }
  else { const placeholder = document.createElement("span"); placeholder.className = "public-card__placeholder"; anchor.append(placeholder); }
  return anchor;
}

function makeCard(post) {
  const article = document.createElement("article"); article.className = "public-home-card";
  article.append(makeImageLink(post));
  const body = document.createElement("div"); body.className = "public-home-card__body";
  const heading = document.createElement("h3"); const titleLink = document.createElement("a"); titleLink.href = `/${encodeURIComponent(post.slug)}`; titleLink.textContent = post.title; heading.append(titleLink); body.append(heading);
  const metadata = document.createElement("p"); metadata.className = "public-home-card__meta";
  if (post.category_name) { const category = document.createElement("a"); category.className = "public-home-card__category"; category.href = `/category/${encodeURIComponent(post.category_slug)}`; category.textContent = post.category_name; metadata.append(category); }
  if (post.author_name) { const author = document.createElement("span"); author.textContent = post.author_name; metadata.append(author); }
  if (post.published_at) { const time = document.createElement("time"); const date = new Date(post.published_at); time.dateTime = date.toISOString(); time.textContent = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date); metadata.append(time); }
  const comments = document.createElement("a"); comments.className = "public-home-card__comments"; comments.href = `/${encodeURIComponent(post.slug)}#comments`; comments.textContent = String(post.comment_count ?? 0); comments.setAttribute("aria-label", `${post.comment_count ?? 0} comments`); metadata.append(comments); body.append(metadata);
  if (post.excerpt) { const excerpt = document.createElement("p"); excerpt.className = "public-home-card__excerpt"; excerpt.textContent = post.excerpt; body.append(excerpt); }
  article.append(body); return article;
}

export function init(pagination) {
  const more = pagination.querySelector(".public-pagination__load-more");
  const list = document.querySelector(".public-story-list");
  if (!more || !list) { return; }
  more.addEventListener("click", async (event) => {
    event.preventDefault();
    const nextPage = Number(new URL(more.href).searchParams.get("page"));
    if (!Number.isSafeInteger(nextPage) || nextPage < 2) { location.assign(more.href); return; }
    more.setAttribute("aria-disabled", "true"); pagination.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(`/api/posts?page=${nextPage}`, { headers: { Accept: "application/json" } });
      if (!response.ok) { throw new Error("Could not load more stories."); }
      const data = await response.json();
      list.append(...data.posts.map(makeCard));
      pagination.dataset.page = String(data.page);
      if (data.page >= data.pageCount) { more.remove(); }
      else { const url = new URL(more.href); url.searchParams.set("page", String(data.page + 1)); more.href = `${url.pathname}${url.search}${url.hash}`; more.removeAttribute("aria-disabled"); }
    } catch { location.assign(more.href); }
    finally { pagination.removeAttribute("aria-busy"); }
  });
}
