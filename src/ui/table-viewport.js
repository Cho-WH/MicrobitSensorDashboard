// Extracted from DataTable, adapted from Cho-WH/bme280 gay-lussac/ui/data-table.js
// at 59c5c149450f970bace2deaa183857c275595853.
// Shared geometry for analysis and editable recording tables. Views retain
// ownership of row contents, drafts and selection.
export function tableRowHeight(table, lines = 2.4) {
  const style = getComputedStyle(table);
  const minimum = parseFloat(style.getPropertyValue('--sl-table-row-min-height')) || 32;
  return Math.max(minimum, Math.ceil(parseFloat(style.fontSize) * lines));
}

export function visibleTableRows(total, scrollTop, height, rowHeight, headerHeight = rowHeight) {
  const first = Math.min(Math.floor(scrollTop / rowHeight), Math.max(0, total - 1));
  const visibleCount = Math.max(1, Math.ceil(((height || 520) - headerHeight) / rowHeight));
  return { first, visibleCount, start:Math.max(0, first - 8), end:Math.min(total, first + visibleCount + 9) };
}

export function tableSpacer(count, rowHeight, columns) {
  const row = document.createElement('tr'); row.className = 'table-spacer'; row.setAttribute('aria-hidden', 'true');
  const cell = row.insertCell(); cell.colSpan = columns; cell.style.height = `${count * rowHeight}px`;
  return row;
}

export function bindTableScrollKeys(scroller, schedule, signal) {
  scroller.addEventListener('keydown', event => {
    if (event.target !== scroller || event.altKey || event.metaKey || !['Home', 'End'].includes(event.key)) return;
    event.preventDefault(); scroller.scrollTop = event.key === 'Home' ? 0 : scroller.scrollHeight; schedule();
  }, {signal});
}
