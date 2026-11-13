export function init(element) {
  const select = element.querySelector('select[name="avatar_media_id"]');
  const openButton = element.querySelector("[data-picker-open]");
  const dialog = element.querySelector("[data-picker-dialog]");
  const grid = element.querySelector("[data-picker-grid]");
  const closeButton = element.querySelector("[data-picker-close]");
  if (!select || !openButton || !dialog || !grid) {return;}

  openButton.addEventListener("click", async () => {
    if (!grid.childElementCount) {await loadImages(grid, select);}
    dialog.showModal();
  });
  closeButton?.addEventListener("click", () => dialog.close());
}

async function loadImages(grid, select) {
  const response = await fetch("/api/admin/media?page=1", { headers: { Accept: "application/json" } });
  if (!response.ok) {return;}
  const images = await response.json();
  for (const image of images) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--secondary media-picker-card";
    const preview = document.createElement("img");
    preview.src = image.thumbnail_url;
    preview.alt = image.alt_text || "Image without alt text";
    const label = document.createElement("span");
    label.textContent = image.alt_text || "No alt text";
    button.append(preview, label);
    button.addEventListener("click", () => {
      select.value = String(image.id);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const wrapper = select.closest(".avatar-picker");
      let preview = wrapper?.querySelector(".avatar-picker__preview");
      if (wrapper && !preview) {
        preview = document.createElement("img");
        preview.className = "avatar-picker__preview";
        preview.alt = "Selected avatar preview";
        wrapper.append(preview);
      }
      if (preview) {
        preview.src = image.url;
        preview.alt = image.alt_text || "Selected avatar without alt text";
      }
      grid.closest("dialog")?.close();
    });
    grid.append(button);
  }
}
