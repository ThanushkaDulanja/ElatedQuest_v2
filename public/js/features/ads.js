function hasAdsConsent() {
  return document.cookie.split(";").some((part) => part.trim() === "eq-consent=ads");
}

let adsenseScriptPromise;
function loadAdsense(publisherId) {
  if (!adsenseScriptPromise) {
    adsenseScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      const clientId = encodeURIComponent(`ca-${publisherId}`);
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  return adsenseScriptPromise;
}

async function fill(slot) {
  if (!hasAdsConsent() || slot.dataset.loaded === "true") { return; }
  slot.hidden = false;
  slot.dataset.loading = "true";
  const timeout = window.setTimeout(() => {
    if (slot.dataset.loaded !== "true") { slot.hidden = true; slot.replaceChildren(); }
  }, 5000);
  try {
    const name = encodeURIComponent(slot.dataset.adSlot ?? "");
    const response = await fetch(`/api/ads/slots/${name}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) { throw new Error("Ad slot is unavailable."); }
    const config = await response.json();
    if (config.provider === "custom") {
      slot.innerHTML = config.html;
      if (slot.childElementCount) { slot.dataset.loaded = "true"; }
    } else {
      const unit = document.createElement("ins");
      unit.className = "adsbygoogle";
      unit.classList.add("public-ad-slot__adsense-unit");
      unit.dataset.adClient = `ca-${config.publisherId}`;
      unit.dataset.adSlot = config.slotId;
      unit.dataset.adFormat = "auto";
      unit.dataset.fullWidthResponsive = "true";
      slot.append(unit);
      await loadAdsense(config.publisherId);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      window.setTimeout(() => {
        if (unit.dataset.adsbygoogleStatus === "done" || unit.querySelector("iframe")) { slot.dataset.loaded = "true"; }
      }, 250);
    }
    if (slot.dataset.loaded === "true") { window.clearTimeout(timeout); }
  } catch {
    window.clearTimeout(timeout);
    slot.hidden = true;
    slot.replaceChildren();
  } finally { delete slot.dataset.loading; }
}

export function init(slot) {
  if (slot.dataset.ownerPlaceholder === "true") { slot.hidden = false; return; }
  let observer;
  const watch = () => {
    if (!hasAdsConsent()) { slot.hidden = true; return; }
    slot.hidden = false;
    if (observer) { observer.disconnect(); }
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void fill(slot); }
    }, { rootMargin: "300px 0px" });
    observer.observe(slot);
  };
  watch();
  window.addEventListener("eq-consent-changed", watch);
}
