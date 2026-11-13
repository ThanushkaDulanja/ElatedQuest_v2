const KEY = "elatedquest.savedStories";

function readSaved() {
  try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

export function init(container) {
  container.addEventListener("click", async (event) => {
    const save = event.target.closest("[data-save-story]");
    const copy = event.target.closest("[data-copy-link]");
    const native = event.target.closest("[data-native-share]");
    if (save) {
      const saved = readSaved();
      const id = String(save.dataset.saveStory);
      const record = { id, title: document.querySelector(".public-post h1")?.textContent?.trim() ?? "", url: location.origin + location.pathname };
      const next = saved.some((item) => String(item.id) === id) ? saved.filter((item) => String(item.id) !== id) : [record, ...saved].slice(0, 200);
      try { localStorage.setItem(KEY, JSON.stringify(next)); save.textContent = next.some((item) => String(item.id) === id) ? "Saved" : "Save story"; }
      catch { save.textContent = "Unable to save"; }
    }
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copyLink); copy.textContent = "Copied"; }
      catch { copy.textContent = "Copy unavailable"; }
    }
    if (native && navigator.share) {
      try { await navigator.share({ title: native.dataset.title, url: native.dataset.url }); }
      catch (error) { if (error.name !== "AbortError") { native.textContent = "Share unavailable"; } }
    }
  });
  for (const button of container.querySelectorAll("[data-save-story]")) {
    if (readSaved().some((item) => String(item.id) === button.dataset.saveStory)) { button.textContent = "Saved"; }
  }
}
