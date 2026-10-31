const FEATURE_NAME = /^[a-z0-9-]+$/;

async function startFeature(element) {
  const name = element.dataset.feature;
  if (!name || !FEATURE_NAME.test(name)) {
    return;
  }

  try {
    const feature = await import(`/js/features/${name}.js`);
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
