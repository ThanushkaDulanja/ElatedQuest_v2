export function init(form) {
  const elapsed = form.elements.namedItem("elapsedMs");
  if (!elapsed) { return; }
  const loadedAt = performance.now();
  form.addEventListener("submit", () => { elapsed.value = String(Math.round(performance.now() - loadedAt)); });
}
