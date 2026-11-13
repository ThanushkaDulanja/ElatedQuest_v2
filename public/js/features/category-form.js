function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function init(root) {
  root.addEventListener("input", (event) => {
    const name = event.target.closest("[data-category-name]");
    if (!name) { return; }
    const form = name.form;
    const slug = form?.querySelector("[data-category-slug]");
    if (!slug || slug.dataset.edited === "true") { return; }
    slug.value = slugify(name.value);
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-category-slug]")) {
      event.target.dataset.edited = "true";
    }
  });

  const editForms = [...root.querySelectorAll(".category-edit")];
  for (const details of editForms) {
    details.addEventListener("toggle", () => {
      if (!details.open) { return; }
      for (const other of editForms) {
        if (other !== details) { other.open = false; }
      }
    });
  }
}
