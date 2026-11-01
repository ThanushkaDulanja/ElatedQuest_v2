export function init(element) {
  const googleButton = element.querySelector("[data-google-sign-in]");
  const emailForm = element.querySelector("[data-email-sign-in]");
  googleButton?.addEventListener("click", () => {
    googleButton.setAttribute("aria-disabled", "true");
    googleButton.classList.add("is-disabled");
    window.setTimeout(() => {
      googleButton.removeAttribute("aria-disabled");
      googleButton.classList.remove("is-disabled");
    }, 3000);
  });
  emailForm?.addEventListener("submit", () => {
    const button = emailForm.querySelector("button[type=submit]");
    if (button) {
      button.disabled = true;
      window.setTimeout(() => {
        button.disabled = false;
      }, 30000);
    }
  });
}
