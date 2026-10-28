import { bindDisclosureMenu } from './disclosure-menu.js';
import { findElement } from './dom.js';
import { createPanelTransition } from './panel-transition.js';

// Bind the static shell. The controller's signal owns these listeners' lifetime.
// No markup, styles, experiment state or recording permissions are created here.
export function bindAppShell(root, { signal }) {
  const transition = createPanelTransition(findElement(root, 'main', '.lab-shell'));
  signal.addEventListener('abort', () => transition.dispose(), { once: true });
  bindFileButtonPlacement(root, signal);
  bindCompatibilityFit(findElement(root, 'header', '.lab-identity'), signal);
  bindDisclosureMenu(findElement(root, 'details', '.luminous-export'), { signal });
  bindHelpDialog(root, signal, 'connection');
  bindHelpDialog(root, signal, 'installation');
  const settings = findElement(root, 'button', '.luminous-settings');
  const dialog = findElement(root, 'dialog', '#measurement-settings');
  const measure = findElement(root, 'section', '[data-screen="measure"]');
  settings.addEventListener('click', () => dialog.showModal(), { signal });
  findElement(dialog, 'button', '.luminous-close').addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', () => {
    if (!measure.hidden && settings.getClientRects().length) settings.focus({ preventScroll: true });
  }, { signal });
}

// All connection entry points open one informational dialog without device actions.
function bindHelpDialog(root, signal, kind) {
  const dialog = findElement(root, 'dialog', `#${kind}-troubleshooting`);
  const title = findElement(dialog, 'h2', `#${kind}-troubleshooting-title`);
  let opener = null;
  root.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest(`[data-${kind}-help]`) : null;
    if (!(trigger instanceof HTMLButtonElement) || trigger.disabled || dialog.open) return;
    opener = trigger;
    dialog.showModal(); title.focus({ preventScroll: true });
  }, { signal });
  dialog.addEventListener('close', () => {
    if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
    opener = null;
  }, { signal });
  signal.addEventListener('abort', () => { if (dialog.open) dialog.close(); }, { once: true });
}

// Move the existing control so focus order follows the visible mobile header.
function bindFileButtonPlacement(root, signal) {
  const button = findElement(root, 'button', '#open-file');
  const tools = findElement(root, 'div', '#file-tools');
  const slot = findElement(root, 'div', '.mobile-file-slot');
  const doc = button.ownerDocument;
  const media = doc.defaultView.matchMedia('(max-width:760px)');
  // CSS may hide the old parent and blur the button before matchMedia fires.
  // Remember its focus until the user moves focus or points elsewhere.
  let focused = doc.activeElement === button;
  doc.addEventListener('focusin', event => { focused = event.target === button; }, { signal });
  doc.addEventListener('pointerdown', event => {
    if (!button.contains(/** @type {Node} */ (event.target))) focused = false;
  }, { signal });
  function place(mobile = media.matches) {
    const target = mobile ? slot : tools;
    if (button.parentElement === target) return;
    if (mobile) slot.append(button);
    else tools.prepend(button);
    if (focused) button.focus({ preventScroll: true });
  }
  media.addEventListener('change', () => place(), { signal });
  signal.addEventListener('abort', () => place(false), { once: true });
  place();
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
