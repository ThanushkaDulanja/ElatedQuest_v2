export function createAutosave({ form, save, status, readonly, autosaveAllowed = true, getSnapshot = () => form }) {
  let timer;
  let snapshot = "";
  let dirty = false;
  let blocked = readonly;
  const current = () => JSON.stringify(getSnapshot());
  const refreshDirty = () => {
    clearTimeout(timer);
    dirty = current() !== snapshot;
    status.textContent = dirty ? "Unsaved changes" : "Saved";
    if (dirty && autosaveAllowed) { timer = setTimeout(() => void save({ autosave: true }), 10000); }
  };
  const markDirty = () => {
    if (blocked) { return; }
    refreshDirty();
  };
  const saved = () => { snapshot = current(); dirty = false; status.textContent = `Saved ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date())}`; };
  const conflict = () => { blocked = true; status.textContent = "Conflict — reload to continue"; };
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);
  return { markDirty, saved, conflict, isDirty: () => dirty, clearTimer: () => clearTimeout(timer), refresh: refreshDirty };
}
