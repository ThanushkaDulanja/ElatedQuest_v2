export function init(form) {
  form.addEventListener("submit", async (event) => {
    if (!window.fetch) { return; }
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch(form.action, { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams(new FormData(form)), credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) { throw new Error(result.error || "Rating could not be saved."); }
      form.parentElement.querySelector("[data-rating-summary]").textContent = result.message;
    } catch (error) { form.parentElement.querySelector("[data-rating-summary]").textContent = error.message; }
    finally { button.disabled = false; }
  });
}
