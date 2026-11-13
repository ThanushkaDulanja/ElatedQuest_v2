export function init(root) {
  const fileInput = root.querySelector('input[type="file"][name="image"]');
  const dropZone = root.querySelector("[data-drop-zone]");
  const uploadForm = root.querySelector("[data-upload-form]");
  const preview = root.querySelector("[data-upload-preview]");
  const previewImage = preview?.querySelector("img");
  const previewName = preview?.querySelector("[data-upload-preview-name]");
  if (!fileInput || !dropZone || !uploadForm) {return;}

  let previewUrl = null;
  const token = uploadForm.elements._csrf.value;
  fileInput.addEventListener("change", () => showPreview(fileInput.files?.[0]));
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) {showMessage(root, "Choose an image to upload."); return;}
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {showMessage(root, "Choose a JPG, PNG, WebP or GIF image."); return;}
    if (file.size > 8 * 1024 * 1024) {showMessage(root, "Image files must be 8 MB or smaller."); return;}
    const button = uploadForm.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch(uploadForm.action, { method: "POST", headers: { Accept: "application/json", "X-CSRF-Token": token }, body: new FormData(uploadForm) });
      if (!response.ok) {showMessage(root, await response.text()); return;}
      const media = await response.json();
      const card = makeMediaCard(media);
      const grid = root.querySelector(".media-grid");
      grid.querySelector("p")?.remove();
      grid.prepend(card);
      card.addEventListener("click", () => selectCard(card, root));
      fileInput.value = "";
      showPreview(null);
      selectCard(card, root);
      showMessage(root, "Image uploaded and selected.", false);
    } catch {showMessage(root, "Upload failed. Check your connection and try again.");}
    finally {button.disabled = false;}
  });

  dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        showMessage(root, "Use the file chooser to select an image, then upload it.");
      }
    }
  });

  const cards = root.querySelectorAll("[data-media-card]");
  for (const card of cards) {card.addEventListener("click", () => selectCard(card, root));}
  const detailForm = root.querySelector("[data-media-details]");
  const deleteForm = root.querySelector("[data-media-delete]");
  const copyButton = root.querySelector("[data-copy-url]");
  copyButton?.addEventListener("click", async () => {
    const url = copyButton.dataset.url || "";
    try { await navigator.clipboard.writeText(url); copyButton.textContent = "Copied"; }
    catch { const copyField = root.querySelector("[data-copy-fallback]"); if (copyField) { copyField.hidden = false; copyField.value = url; copyField.select(); } }
  });
  detailForm?.addEventListener("submit", async (event) => {
    if (!detailForm.dataset.ajax) {return;}
    event.preventDefault();
    const formData = new URLSearchParams(new FormData(detailForm));
    const response = await fetch(detailForm.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-CSRF-Token": token }, body: formData });
    if (response.ok) {window.location.reload();}
    else {showMessage(root, await response.text());}
  });
  deleteForm?.addEventListener("submit", async (event) => {
    if (!deleteForm.dataset.ajax) {return;}
    event.preventDefault();
    const response = await fetch(deleteForm.action, { method: "POST", headers: { Accept: "application/json", "X-CSRF-Token": token } });
    if (response.ok) {window.location.reload();}
    else { const result = await response.json(); showMessage(root, result.error); }
  });

  function showPreview(file) {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (!preview || !previewImage || !file) {
      if (preview) { preview.hidden = true; }
      return;
    }
    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    previewImage.alt = "Selected image preview";
    previewName.textContent = file.name;
    preview.hidden = false;
  }
}

function makeMediaCard(media) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "btn btn--secondary media-card media-card--latest";
  Object.assign(card.dataset, { id: media.id, url: media.url, fileName: media.file_name, size: media.size_bytes, width: media.width, height: media.height, alt: media.alt_text ?? "", credit: media.credit_text ?? "", creditUrl: media.credit_url ?? "", uses: "0", usageLabels: "" });
  const image = document.createElement("img");
  image.src = media.thumbnail_url;
  image.alt = media.alt_text || "Image without alt text";
  image.width = 400;
  image.height = 400;
  image.loading = "lazy";
  card.append(image);
  if (media.no_alt) {const badge = document.createElement("span"); badge.className = "no-alt-badge"; badge.textContent = "no alt"; card.append(badge);}
  const name = document.createElement("span");
  name.className = "media-card__name";
  name.textContent = media.file_name;
  card.append(name);
  return card;
}

function selectCard(card, root) {
  root.querySelectorAll("[data-media-card].is-selected").forEach((item) => item.classList.remove("is-selected"));
  card.classList.add("is-selected");
  const details = root.querySelector("[data-media-detail-panel]");
  const detailForm = root.querySelector("[data-media-details]");
  const deleteForm = root.querySelector("[data-media-delete]");
  const deleteButton = deleteForm?.querySelector('button[type="submit"]');
  if (!details || !detailForm) {return;}
  details.hidden = false;
  detailForm.action = `/api/admin/media/${card.dataset.id}`;
  detailForm.elements.alt_text.value = card.dataset.alt || "";
  detailForm.elements.credit_text.value = card.dataset.credit || "";
  detailForm.elements.credit_url.value = card.dataset.creditUrl || "";
  detailForm.elements.media_id.value = card.dataset.id;
  details.querySelector("[data-detail-image]").src = card.dataset.url;
  details.querySelector("[data-detail-image]").alt = card.dataset.alt || "Image without alt text";
  details.querySelector("[data-detail-name]").textContent = card.dataset.fileName;
  details.querySelector("[data-detail-size]").textContent = formatBytes(Number(card.dataset.size));
  details.querySelector("[data-detail-dimensions]").textContent = `${card.dataset.width} × ${card.dataset.height}`;
  details.querySelector("[data-detail-uses]").textContent = `Used in ${card.dataset.uses} place(s)`;
  details.querySelector("[data-detail-use-list]").textContent = card.dataset.usageLabels || "Not used";
  const copyButton = root.querySelector("[data-copy-url]");
  copyButton.dataset.url = card.dataset.url;
  const copyField = root.querySelector("[data-copy-fallback]");
  if (copyField) {copyField.value = card.dataset.url;}
  if (deleteForm) {deleteForm.action = `/api/admin/media/${card.dataset.id}/delete`;}
  if (deleteButton) {deleteButton.disabled = Number(card.dataset.uses) > 0;}
}

function showMessage(root, message, isError = true) {
  const target = root.querySelector("[data-media-message]");
  if (target) { target.textContent = message; target.hidden = false; target.setAttribute("role", isError ? "alert" : "status"); target.classList.toggle("flash-message--error", isError); }
}

function formatBytes(size) {
  if (size < 1024) {return `${size} B`;}
  if (size < 1024 * 1024) {return `${(size / 1024).toFixed(1)} KB`;}
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
