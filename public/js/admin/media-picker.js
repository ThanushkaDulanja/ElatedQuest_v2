export function createMediaPicker(root, onChoose) {
  const dialog = root.querySelector(".media-picker");
  const results = dialog.querySelector("[data-picker-results]");
  const search = dialog.querySelector("[data-picker-search]");
  const more = dialog.querySelector("[data-picker-more]");
  let target = "body";
  let page = 1;
  async function load(reset = false) {
    if (reset) { page = 1; results.replaceChildren(); }
    const currentPage = page;
    try {
      const response = await fetch(`/api/admin/media?query=${encodeURIComponent(search.value)}&page=${currentPage}`, { headers: { Accept: "application/json" } });
      if (!response.ok) { throw new Error("The media library could not be loaded."); }
      const payload = await response.json();
      if (reset) { results.replaceChildren(); }
      const images = Array.isArray(payload) ? payload : payload.rows ?? payload.media ?? [];
      for (const image of images) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "btn btn--secondary media-card editor-media-option";
        const preview = document.createElement("img"); preview.src = image.thumbnail_url || image.url; preview.alt = image.alt_text || "";
        const caption = document.createElement("span"); caption.className = "media-card__name"; caption.textContent = image.alt_text || "No alt text"; caption.title = image.alt_text || "No alt text";
        card.append(preview, caption);
        card.disabled = !image.alt_text?.trim();
        if (card.disabled) { card.title = "Alt text is required for accessibility before an image can be inserted."; }
        card.addEventListener("click", () => { if (image.alt_text?.trim()) { onChoose(image, target); dialog.hidden = true; } });
        results.append(card);
      }
      page = currentPage + 1;
      more.hidden = images.length < 20;
      if (!results.childElementCount) { results.textContent = "No images found."; }
    } catch (error) { results.textContent = error.message; more.hidden = true; }
  }
  async function open(forTarget = "body") {
    target = forTarget;
    dialog.hidden = false;
    search.value = "";
    results.replaceChildren(Object.assign(document.createElement("p"), { textContent: "Loading images…" }));
    await load(true);
  }
  root.querySelectorAll("[data-open-media-picker]").forEach((button) => button.addEventListener("click", () => void open(button.dataset.target)));
  search.addEventListener("input", () => void load(true));
  more.addEventListener("click", () => void load());
  dialog.querySelector("[data-close-media-picker]").addEventListener("click", () => { dialog.hidden = true; });
  return { open };
}
