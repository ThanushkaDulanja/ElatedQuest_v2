export function init(element) {
  const progressBar = element.querySelector(".public-progress-bar");
  if (!progressBar) { return; }
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const bounds = element.getBoundingClientRect();
    const articleTop = window.scrollY + bounds.top;
    const articleHeight = Math.max(1, element.scrollHeight - window.innerHeight);
    const progress = Math.min(100, Math.max(0, ((window.scrollY - articleTop) / articleHeight) * 100));
    progressBar.value = progress;
  };
  const onScroll = () => {
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(update); }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
}
