const FEATURE_NAME = /^[a-z0-9-]+$/;

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.hasAttribute("data-card-image")) { return; }

  const placeholder = document.createElement("span");
  placeholder.className = "public-card__placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", "Image unavailable");
  image.replaceWith(placeholder);
}, true);

async function startFeature(element) {
  const name = element.dataset.feature;
  if (!name || !FEATURE_NAME.test(name)) {
    return;
  }

  try {
    const feature = name === "admin-login"
      ? await import("/js/features/admin-login.js")
      : name.startsWith("admin-")
        ? await import(`/js/admin/${name.slice(6)}.js`)
        : await import(`/js/features/${name}.js`);
    if (typeof feature.init === "function") {
      await feature.init(element);
    }
  } catch (error) {
    console.error(`Unable to start page feature "${name}".`, error);
  }
}

for (const element of document.querySelectorAll("[data-feature]")) {
  void startFeature(element);
}
