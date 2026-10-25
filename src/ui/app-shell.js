import { bindDisclosureMenu } from './disclosure-menu.js';
import { findElement } from './dom.js';

// Bind the static shell. The controller's signal owns these listeners' lifetime.
// No markup, styles, experiment state or recording permissions are created here.
export function bindAppShell(root, { signal }) {
  bindCompatibilityFit(findElement(root, 'header', '.lab-identity'), signal);
  bindDisclosureMenu(findElement(root, 'details', '.luminous-export'), { signal });
  const settings = findElement(root, 'button', '.luminous-settings');
  const dialog = findElement(root, 'dialog', '#measurement-settings');
  const measure = findElement(root, 'section', '[data-screen="measure"]');
  settings.addEventListener('click', () => dialog.showModal(), { signal });
  findElement(dialog, 'button', '.luminous-close').addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', () => {
    if (!measure.hidden && settings.getClientRects().length) settings.focus({ preventScroll: true });
  }, { signal });
}

// Only show the optional mark when the actual title, status and tools fit on
// one row with it. No experiment state or fixed desktop width budget is used.
function bindCompatibilityFit(header, signal) {
  const win = header.ownerDocument.defaultView;
  let frame = null;
  function fit() {
    frame = null;
    let fits = false;
    if (win.matchMedia('(min-width:761px)').matches && header.getClientRects().length) {
      header.classList.add('is-sizing-compatibility');
      try {
        const style = win.getComputedStyle(header);
        const children = [...header.children].filter(child => child.getClientRects().length);
        const needed = children.reduce((width, child) => width + child.getBoundingClientRect().width, 0)
          + (parseFloat(style.columnGap) || 0) * Math.max(0, children.length - 1);
        const available = header.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
        fits = needed + 8 <= available;
      } finally { header.classList.remove('is-sizing-compatibility'); }
    }
    header.toggleAttribute('data-compatibility-fit', fits);
  }
  function schedule() {
    if (frame === null && !signal.aborted) frame = win.requestAnimationFrame(fit);
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(header);
  for (const child of header.children) resize.observe(child);
  let content = header.textContent;
  const changes = new MutationObserver(records => {
    const next = header.textContent;
    if (next !== content || records.some(record => record.type === 'attributes')) schedule();
    content = next;
  });
  changes.observe(header, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden']});
  win.addEventListener('resize', schedule, {signal});
  signal.addEventListener('abort', () => {
    resize.disconnect(); changes.disconnect();
    if (frame !== null) win.cancelAnimationFrame(frame);
    header.removeAttribute('data-compatibility-fit');
  }, {once:true});
  schedule();
}
