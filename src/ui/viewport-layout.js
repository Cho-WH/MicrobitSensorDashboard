// A workspace receives the space between its document position and the viewport
// bottom. CSS distributes that budget among controls, plots and tables. Expanded
// content may exceed it; this helper never shrinks text or scrolls the document.
/** @param {HTMLElement} root @param {{regions:HTMLElement[],signal:AbortSignal,minWidth?:number}} options */
export function createViewportLayout(root, { regions, signal, minWidth = 1001 }) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const eligible = win.matchMedia(`(min-width: ${minWidth}px)`);
  let frame = null;
  function fit() {
    frame = null;
    const active = eligible.matches && root.getClientRects().length;
    const inset = parseFloat(win.getComputedStyle(doc.body).paddingBottom) || 0;
    const bottom = root.getBoundingClientRect().bottom;
    for (const region of regions) {
      if (!active || !region.getClientRects().length) {
        region.style.removeProperty('--workspace-height'); continue;
      }
      const rect = region.getBoundingClientRect();
      const tail = bottom - rect.bottom;
      const value = Math.max(0, Math.floor(win.innerHeight - rect.top - win.scrollY - tail - inset)) + 'px';
      if (region.style.getPropertyValue('--workspace-height') !== value) region.style.setProperty('--workspace-height', value);
    }
  }
  function schedule() {
    if (frame === null && !signal.aborted) frame = win.requestAnimationFrame(fit);
  }
  const observer = new ResizeObserver(schedule);
  // Content and siblings can move its top (notice, header, toolbars). A single
  // scheduled read/write pass coalesces the resize notifications.
  const elements = new Set(/** @type {Element[]} */ ([root, doc.body, ...regions]));
  for (let parent = root; parent; parent = parent.parentElement) {
    for (const child of parent.children) elements.add(child);
  }
  for (const element of elements) observer.observe(element);
  root.addEventListener('toggle', schedule, {capture:true, signal});
  win.addEventListener('resize', schedule, {signal});
  signal.addEventListener('abort', () => {
    observer.disconnect(); if (frame !== null) win.cancelAnimationFrame(frame);
    for (const region of regions) region.style.removeProperty('--workspace-height');
  }, {once:true});
  schedule();
  return {schedule};
}
