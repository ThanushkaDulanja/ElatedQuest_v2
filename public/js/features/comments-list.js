function makeComment(comment, slug) {
  const item = document.createElement("li");
  item.className = "public-comment";
  item.id = `comment-${comment.id}`;
  const avatar = document.createElement("span");
  avatar.className = "public-comment__avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = comment.author_initials;
  const body = document.createElement("div");
  const meta = document.createElement("p");
  meta.className = "public-comment__meta";
  const author = document.createElement("strong");
  author.textContent = comment.author_name;
  meta.append(author);
  if (comment.is_staff) {
    const badge = document.createElement("span");
    badge.className = "public-comment__staff";
    badge.textContent = "STAFF";
    meta.append(" ", badge);
  }
  const date = new Date(comment.created_at);
  meta.append(` · ${date.toLocaleDateString()}`);
  const text = document.createElement("p");
  text.className = "public-comment__body";
  text.textContent = comment.body;
  const score = document.createElement("p");
  score.className = "public-comment__votes";
  score.textContent = `Score: ${comment.vote_score}`;
  const vote = document.createElement("form");
  vote.className = "public-comment__vote";
  vote.action = `/api/comments/${comment.id}/vote`;
  vote.method = "post";
  const slugField = document.createElement("input");
  slugField.type = "hidden";
  slugField.name = "postSlug";
  slugField.value = slug;
  vote.append(slugField);
  for (const [value, label] of [["1", "Upvote"], ["-1", "Downvote"]]) {
    const button = document.createElement("button");
    button.type = "submit";
    button.name = "value";
    button.value = value;
    button.setAttribute("aria-label", label);
    button.textContent = value === "1" ? "▲" : "▼";
    vote.append(button);
  }
  body.append(meta, text, score, vote);
  item.append(avatar, body);
  return item;
}

export function init(section) {
  const more = section.querySelector(".public-comments__more");
  const list = section.querySelector(".public-comment-list");
  if (!more || !list) { return; }
  more.addEventListener("click", async (event) => {
    event.preventDefault();
    more.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(more.href, { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (!response.ok) { throw new Error("Could not load more comments."); }
      const comments = await response.json();
      for (const comment of comments) { list.append(makeComment(comment, section.dataset.postSlug)); }
      const next = new URL(more.href);
      next.searchParams.set("offset", String(Number(next.searchParams.get("offset") || "0") + comments.length));
      if (comments.length < 10) { more.remove(); } else { more.href = next.href; }
    } catch { more.textContent = "Could not load comments. Try again."; }
    finally { more.removeAttribute("aria-busy"); }
  });
}
