export function initRevisions(root, saveAndReadStamp, showError) {
  root.querySelectorAll(".editor-revisions form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveAndReadStamp();
      form.querySelector('[name="expected_updated_at"]').value = root.dataset.updatedAt;
      const response = await fetch(form.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content }, body: new URLSearchParams(new FormData(form)) });
      const data = await response.json();
      if (!response.ok) { throw new Error(data.error || "Revision restore failed."); }
      location.reload();
    } catch (error) { showError(error.message); }
  }));
}
