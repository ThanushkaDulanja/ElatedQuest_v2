export function init(root) {
  const form = root.querySelector(".page-editor-form");
  const source = form?.querySelector("[data-page-content]");
  const editor = root.querySelector("[data-page-quill]");
  const toolbar = root.querySelector("[data-page-toolbar]");
  if (!form || !source || !editor || !toolbar || !window.Quill) { return; }
  const quill = new window.Quill(editor, { theme: "snow", modules: { toolbar } });
  quill.root.innerHTML = source.value;
  source.hidden = true;
  editor.hidden = false;
  toolbar.hidden = false;
  form.addEventListener("submit", () => { source.value = quill.root.innerHTML; });
}
