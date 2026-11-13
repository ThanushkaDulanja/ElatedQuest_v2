export function init(form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cell = form.closest("td");
    const button = form.querySelector('button[type="submit"]');
    if (!cell || !button) { return; }

    button.disabled = true;
    button.textContent = "Syncing…";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-CSRF-Token": form.elements._csrf.value,
        },
      });
      const result = await response.json();
      if (!response.ok || result.status === "failed") {
        throw new Error(result.message || "Blogger synchronization failed.");
      }

      if (result.status === "synced") {
        const synced = document.createElement(result.url ? "a" : "span");
        synced.textContent = "Synced";
        if (result.url) {
          synced.href = result.url;
          synced.target = "_blank";
          synced.rel = "noopener";
        }
        synced.setAttribute("aria-label", "Post synced to Blogger");
        cell.replaceChildren(synced);
        return;
      }

      const status = document.createElement("span");
      status.className = "status-badge status-badge--pending";
      status.textContent = "Syncing";
      cell.replaceChildren(status);
    } catch (error) {
      let message = cell.querySelector("[data-blogger-sync-error]");
      if (!message) {
        message = document.createElement("span");
        message.dataset.bloggerSyncError = "";
        message.setAttribute("role", "alert");
        cell.prepend(message);
      }
      message.textContent = error.message;
      button.disabled = false;
      button.textContent = "Retry sync";
    }
  });
}
