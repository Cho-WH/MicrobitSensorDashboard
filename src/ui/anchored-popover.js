// Adapted from Cho-WH/bme280 gay-lussac/ui/anchored-popover.js at 59c5c149450f970bace2deaa183857c275595853.
// Shared viewport positioning for compact table popovers; no workspace state.
export function positionPopover(panel, anchor) {
  if (!anchor?.isConnected || !panel.matches(':popover-open')) return;
  const rect = anchor.getBoundingClientRect();
  panel.style.left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - panel.offsetWidth - 8)) + 'px';
  panel.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - panel.offsetHeight - 8)) + 'px';
}
