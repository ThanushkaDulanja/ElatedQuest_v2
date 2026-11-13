const COOKIE = "eq-consent";
const MAX_AGE = 60 * 60 * 24 * 183;

function choice() {
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : "";
}

export function init(banner) {
  const openButton = document.querySelector("[data-open-consent]");
  const show = () => { banner.hidden = false; banner.querySelector("[data-consent-ads]")?.focus(); };
  const hide = () => { banner.hidden = true; };
  const setChoice = (value) => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    hide();
    window.dispatchEvent(new CustomEvent("eq-consent-changed", { detail: { choice: value } }));
  };
  banner.querySelector("[data-consent-ads]")?.addEventListener("click", () => setChoice("ads"));
  banner.querySelector("[data-consent-essential]")?.addEventListener("click", () => setChoice("essential"));
  openButton?.addEventListener("click", (event) => { event.preventDefault(); show(); });
  if (choice()) { hide(); } else { show(); }
}
