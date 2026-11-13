function renderRow(post, index, mobile) {
  if (mobile) {
    const card = document.createElement("article"); card.className = "public-card";
    const anchor = document.createElement("a"); anchor.className = "public-card__link"; anchor.href = `/${encodeURIComponent(post.slug)}`;
    if (post.cover_url) { const image = document.createElement("img"); image.className = "public-card__image"; image.src = post.cover_url; image.alt = post.cover_alt ?? ""; image.width = post.cover_width || 800; image.height = post.cover_height || 450; image.loading = "lazy"; anchor.append(image); }
    const heading = document.createElement("h2"); heading.textContent = post.title; anchor.append(heading); card.append(anchor);
    if (post.category_name) { const category = document.createElement("a"); category.className = "public-card__category"; category.href = `/category/${encodeURIComponent(post.category_slug)}`; category.textContent = post.category_name; card.append(category); }
    return card;
  }
  const article = document.createElement("article"); article.className = "public-card-row"; article.dataset.rank = String(index + 1);
  const imageLink = document.createElement("a"); imageLink.className = "public-card-row__image-link"; imageLink.href = `/${encodeURIComponent(post.slug)}`; imageLink.setAttribute("aria-label", `Read ${post.title}`);
  if (post.cover_url) { const image = document.createElement("img"); image.src = post.cover_url; image.alt = post.cover_alt ?? ""; image.width = post.cover_width || 800; image.height = post.cover_height || 450; image.loading = "lazy"; imageLink.append(image); }
  else { const placeholder = document.createElement("span"); placeholder.className = "public-card__placeholder"; imageLink.append(placeholder); }
  const body = document.createElement("div");
  if (post.category_name) { const category = document.createElement("a"); category.className = "public-card__category"; category.href = `/category/${encodeURIComponent(post.category_slug)}`; category.textContent = post.category_name; body.append(category); }
  const heading = document.createElement("h2"); const title = document.createElement("a"); title.href = `/${encodeURIComponent(post.slug)}`; title.textContent = post.title; heading.append(title); body.append(heading);
  article.append(imageLink, body); return article;
}

export function init(section) {
  const target = section.querySelector(".public-popular-period-results");
  const mobile = section.classList.contains("public-popular-mobile");
  const tabs = [...section.querySelectorAll("[data-days]")];
  for (const tab of tabs) { tab.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`/api/posts/popular?days=${tab.dataset.days}`, { headers: { Accept: "application/json" } });
      if (!response.ok) { throw new Error("Could not load popular stories."); }
      const posts = await response.json();
      target.replaceChildren(...posts.map((post, index) => renderRow(post, index, mobile)));
      for (const link of tabs) { if (link === tab) { link.setAttribute("aria-current", "true"); } else { link.removeAttribute("aria-current"); } }
    } catch { location.assign(tab.href); }
  }); }
}
