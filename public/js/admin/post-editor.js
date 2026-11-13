import { createAutosave } from "./autosave.js";
import { createMediaPicker } from "./media-picker.js";
import { initRevisions } from "./revisions.js";
import { buildPostPayload } from "./post-payload.js";

export function init(root) {
  const form = root.querySelector("#post-form");
  const readonly = root.dataset.readOnly === "true";
  if (readonly) {
    return;
  }
  const error = root.querySelector(".editor-error");
  let serverMissing = [];
  const showError = (message, missing = []) => {
    error.replaceChildren(); error.hidden = false;
    const text = document.createElement("p"); text.textContent = message; error.append(text);
    if (missing.length) { const list = document.createElement("ul"); for (const item of missing) { const row = document.createElement("li"); row.textContent = item; list.append(row); } error.append(list); }
    serverMissing = missing;
    updateChecklist();
  };
  const status = root.querySelector(".autosave-status");
  const autosave = createAutosave({ form, save, status, readonly, autosaveAllowed: root.dataset.status !== "published", getSnapshot: () => ({ fields: Object.fromEntries(new FormData(form)), content_html: quill?.root?.innerHTML ?? form.elements.content_html.value }) });
  const quillRoot = root.querySelector("#quill-editor");
  const ImageBlot = window.Quill.import("formats/image");
  class ResponsiveImageBlot extends ImageBlot {
    static formats(node) {
      const formats = super.formats(node);
      const imageSize = node.getAttribute("data-image-size");
      if (["small", "medium", "full"].includes(imageSize)) { formats.imageSize = imageSize; }
      return formats;
    }
    format(name, value) {
      if (name === "imageSize") {
        if (["small", "medium", "full"].includes(value)) { this.domNode.setAttribute("data-image-size", value); }
        else { this.domNode.removeAttribute("data-image-size"); }
      } else { super.format(name, value); }
    }
  }
  window.Quill.register(ResponsiveImageBlot, true);
  let lastBodyRange = null;
  const quill = new window.Quill(quillRoot, { theme: "snow", readOnly: readonly, modules: { toolbar: { container: "#post-toolbar", handlers: { image: () => { lastBodyRange = quill.getSelection(); picker.open("body"); } } } } });
  root.classList.add("is-enhanced");
  const slugField = form.elements.slug;
  let slugManuallyEdited = !slugField.value.startsWith("draft-");
  slugField.addEventListener("input", () => { slugManuallyEdited = true; });
  form.elements.title.addEventListener("input", () => {
    if (!slugManuallyEdited) {
      slugField.value = form.elements.title.value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80).replace(/-+$/u, "");
    }
  });
  const body = form.elements.content_html;
  const imageSizeToolbar = root.querySelector("[data-image-size-toolbar]");
  let selectedBodyImage = null;
  quill.root.innerHTML = body.value;
  autosave.saved();
  quill.on("text-change", () => { body.value = quill.root.innerHTML; form.dispatchEvent(new Event("input", { bubbles: true })); updateChecklist(); });
  quillRoot.addEventListener("click", (event) => {
    const image = event.target.closest("img");
    selectedBodyImage?.classList.remove("is-selected");
    selectedBodyImage = image && quillRoot.contains(image) ? image : null;
    selectedBodyImage?.classList.add("is-selected");
    if (imageSizeToolbar) {imageSizeToolbar.hidden = !selectedBodyImage;}
  });
  quillRoot.addEventListener("keydown", (event) => {
    if (!selectedBodyImage || !["Backspace", "Delete"].includes(event.key)) { return; }
    const blot = window.Quill.find(selectedBodyImage);
    if (!blot) { return; }
    const index = quill.getIndex(blot);
    event.preventDefault();
    quill.deleteText(index, 1, "user");
    selectedBodyImage = null;
    imageSizeToolbar.hidden = true;
    quill.setSelection(Math.max(0, index), 0, "silent");
  });
  imageSizeToolbar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-size]");
    if (!button || !selectedBodyImage) {return;}
    const blot = window.Quill.find(selectedBodyImage);
    if (blot) { quill.formatText(quill.getIndex(blot), 1, "imageSize", button.dataset.imageSize, "user"); }
  });
  const picker = createMediaPicker(root, (image, target) => {
    const url = image.url;
    if (target === "cover" || target === "og") {
      const idField = root.querySelector(target === "cover" ? "#cover-media-id" : "#og-media-id");
      idField.value = image.id;
      if (target === "cover") {
        root.querySelector(".cover-media-preview").replaceChildren();
        const img = document.createElement("img"); img.src = url; img.alt = image.alt_text;
        root.querySelector(".cover-media-preview").append(img);
        root.querySelector(".cover-alt").textContent = image.alt_text;
        if (!root.querySelector("#og-media-id").value) {
          root.querySelector("#og-media-id").value = image.id;
          root.querySelector("[data-og-summary]").textContent = "Uses cover image";
        }
      } else {
        root.querySelector("[data-og-summary]").textContent = image.alt_text;
      }
    } else {
      const range = lastBodyRange ?? quill.getSelection(true);
      const insertAt = Math.min(range?.index ?? Math.max(0, quill.getLength() - 1), Math.max(0, quill.getLength() - 1));
      quill.insertEmbed(insertAt, "image", url, "user");
      quill.formatText(insertAt, 1, "alt", image.alt_text, "user");
      quill.formatText(insertAt, 1, "imageSize", "full", "user");
      if (insertAt + 1 >= quill.getLength() - 1 || quill.getText(insertAt + 1, 1) !== "\n") { quill.insertText(insertAt + 1, "\n", "user"); }
      quill.setSelection(insertAt + 2, 0, "silent");
      lastBodyRange = null;
      const blot = quill.getLeaf(insertAt)[0];
      const node = blot?.domNode;
      if (node) {
        if (image.width) { quill.formatText(insertAt, 1, "width", image.width, "user"); }
        if (image.height) { quill.formatText(insertAt, 1, "height", image.height, "user"); }
      }
      body.value = quill.root.innerHTML; autosave.markDirty();
    }
    updateChecklist();
  });
  root.querySelector("[data-use-cover]")?.addEventListener("click", () => { root.querySelector("#og-media-id").value = ""; root.querySelector("[data-og-summary]").textContent = "Uses cover image"; autosave.markDirty(); });
  root.querySelector("[data-remove-og]")?.addEventListener("click", () => { root.querySelector("#og-media-id").value = ""; root.querySelector("[data-og-summary]").textContent = "No social image"; autosave.markDirty(); });
  root.addEventListener("input", () => { serverMissing = []; updateChecklist(); });
  root.addEventListener("change", () => { serverMissing = []; updateChecklist(); });
  function setStamp(stamp) { root.dataset.updatedAt = stamp; form.elements.expected_updated_at.value = stamp; root.querySelectorAll('[name="expected_updated_at"]').forEach((field) => { field.value = stamp; }); }
  async function save({ autosave: isAuto = false } = {}) {
    autosave.clearTimer(); body.value = quill.root.innerHTML;
    const data = buildPostPayload(Object.fromEntries(new FormData(form)), { contentHtml: quill.root.innerHTML, expectedUpdatedAt: root.dataset.updatedAt, autosave: isAuto });
    try {
      const response = await fetch(form.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content }, body: data });
      const result = await response.json();
      if (response.status === 409) { autosave.conflict(); showError(result.error); return false; }
      if (!response.ok) { showError(result.error || "Save failed.", result.missing); return false; }
      setStamp(result.updated_at); quill.root.innerHTML = result.content_html; body.value = result.content_html; serverMissing = []; autosave.saved(); error.hidden = true; updateChecklist(); return true;
    } catch { showError("Unable to save. Check your connection and try again."); return false; }
  }
  form.addEventListener("submit", async (event) => { event.preventDefault(); if (await save()) { location.reload(); } });
  root.querySelectorAll(".editor-action-form").forEach((actionForm) => actionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const publish = actionForm.action.endsWith("/publish");
    if (publish && !checklistReady()) { showError("Complete the publish checklist before publishing.", missingChecklist()); return; }
    if (!await save()) { return; }
    actionForm.querySelector('[name="expected_updated_at"]').value = root.dataset.updatedAt;
    const response = await fetch(actionForm.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content }, body: new URLSearchParams(new FormData(actionForm)) });
    const result = await response.json();
    if (!response.ok) { showError(result.error || "Action failed.", result.missing); return; }
    if (publish || actionForm.action.endsWith("/reject")) { const query = publish ? `published=1${result.blogger?.status === "failed" ? "&blogger_failed=1" : ""}` : "changes_requested=1"; location.assign(`/aadmin?${query}`); } else { location.reload(); }
  }));
  root.querySelector("[data-blogger-retry]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const retryForm = event.currentTarget;
    const button = retryForm.querySelector("button");
    const status = root.querySelector("[data-blogger-status]");
    button.disabled = true;
    try {
      const response = await fetch(retryForm.action, { method: "POST", headers: { Accept: "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content } });
      const result = await response.json();
      if (!response.ok || result.status === "failed") { throw new Error(result.message || "Blogger synchronization failed."); }
      if (status) { status.textContent = result.status === "synced" ? "Synced successfully." : "Synchronization is in progress."; status.setAttribute("role", "status"); }
      if (result.status === "synced" && result.url && status) { const link = document.createElement("a"); link.href = result.url; link.target = "_blank"; link.rel = "noopener"; link.textContent = " Open Blogger post"; status.append(link); }
    } catch (retryError) { if (status) { status.textContent = `Sync failed: ${retryError.message}`; status.setAttribute("role", "alert"); } }
    finally { button.disabled = false; }
  });
  function missingChecklist() {
    const title = form.elements.title.value.trim(); const slug = form.elements.slug.value.trim(); const cover = root.querySelector("#cover-media-id").value && root.querySelector(".cover-alt").textContent.trim() !== "Alt text required"; const category = root.querySelector("#category-id").value; const html = quill.getText().trim(); const description = root.querySelector("#seo-description").value.trim();
    return [[title, "title"], [slug, "slug"], [cover, "cover image with alt text"], [category, "category"], [html, "body"], [description && description.length <= 160, "meta description"]].filter(([ready]) => !ready).map(([, label]) => label);
  }
  function checklistReady() { return missingChecklist().length === 0; }
  function updateChecklist() { const missing = new Set([...missingChecklist(), ...serverMissing]); root.querySelectorAll("[data-check]").forEach((item) => { const label = item.dataset.check === "cover" ? "cover image with alt text" : item.dataset.check === "meta" ? "meta description" : item.dataset.check; item.classList.toggle("is-ready", !missing.has(label)); item.classList.toggle("is-missing", missing.has(label)); }); root.querySelectorAll("[data-primary-publish]").forEach((button) => { button.disabled = !checklistReady() || serverMissing.length > 0; }); }
  for (const [id, max] of [["seo-title", 60], ["seo-description", 160]]) { const field = root.querySelector(`#${id}`); field.addEventListener("input", () => { root.querySelector(`[data-counter="${id}"]`).textContent = `${field.value.length}/${max}`; updateChecklist(); }); }
  initRevisions(root, async () => { if (autosave.isDirty() && !await save()) { throw new Error("Save the current edits before restoring a revision."); } }, showError);
  updateChecklist();
}
