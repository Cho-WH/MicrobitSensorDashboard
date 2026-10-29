import { element } from './dom.js';
import { positionPopover } from './anchored-popover.js';

let labelId = 0;

// Shared by point-variable and note editors. Drafts stay with their owning view;
// leaving an editor commits, while invalid input remains available to correct.
export function createPointPopover(panel, { save, signal, onClose = () => {} }) {
  panel.setAttribute('popover', 'manual');
  let anchor = null, composing = false;
  const isOpen = () => panel.matches(':popover-open');
  function close({ discard = false, focus = false } = {}) {
    if (!isOpen()) return true;
    if (!discard && (composing || save() === false)) return false;
    panel.hidePopover(); anchor?.setAttribute('aria-expanded', 'false');
    if (focus && anchor?.isConnected) anchor.focus({preventScroll:true});
    onClose();
    return true;
  }
  function open(button) {
    if (isOpen()) return close({focus:true});
    anchor = button; panel.showPopover(); anchor.setAttribute('aria-expanded','true');
    positionPopover(panel, anchor); panel.querySelector('input,textarea,button')?.focus({preventScroll:true});
    return true;
  }
  panel.addEventListener('compositionstart', () => { composing = true; }, {signal});
  panel.addEventListener('compositionend', () => {
    composing = false;
    if (!panel.contains(document.activeElement)) close();
  }, {signal});
  panel.addEventListener('focusout', event => {
    // Pointer focus can briefly leave activeElement at body before the next
    // control receives focus. Internal moves (including clear) stay in draft.
    if (panel.contains(event.relatedTarget) || event.relatedTarget === anchor) return;
    queueMicrotask(() => {
      if (isOpen() && !panel.contains(document.activeElement) && document.activeElement !== anchor) close();
    });
  }, {signal});
  document.addEventListener('pointerdown', event => {
    if (isOpen() && !panel.contains(event.target) && !anchor?.contains(event.target)) close();
  }, {signal, capture:true});
  document.addEventListener('keydown', event => {
    if (!isOpen() || event.defaultPrevented || event.isComposing || composing || event.keyCode === 229) return;
    const target = event.target;
    if (event.key === 'Escape' || (target instanceof Element && panel.contains(target) && event.key === 'Enter' && !target.matches('textarea,button'))) {
      event.preventDefault(); event.stopPropagation(); close({focus:true});
    }
  }, {signal});
  const position = () => positionPopover(panel, anchor);
  window.addEventListener('resize', position, {signal});
  window.addEventListener('scroll', position, {signal, capture:true, passive:true});
  signal.addEventListener('abort', () => close({discard:true}), {once:true});
  return {open, close, isOpen};
}

export function clearablePointInput(input, label, signal) {
  const caption = input.closest('label')?.querySelector('span');
  if (caption && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
    caption.id ||= 'point-input-label-' + ++labelId;
    input.setAttribute('aria-labelledby', caption.id);
  }
  const wrapper = element('div', 'point-input-wrap'), clear = element('button', 'point-clear');
  clear.type = 'button'; clear.dataset.uiAction = 'quiet'; clear.setAttribute('aria-label', label);
  clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
  input.replaceWith(wrapper); wrapper.append(input, clear);
  clear.addEventListener('click', () => {
    if (input.disabled || input.readOnly) return;
    input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); input.focus({preventScroll:true});
  }, {signal});
  return clear;
}
