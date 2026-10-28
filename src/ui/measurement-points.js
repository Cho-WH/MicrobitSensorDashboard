import { element } from './dom.js';
import { groupTimeMarkers } from './time-markers.js';
import { getLabCopy, formatCopy } from './lab-copy.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';

// Point annotations are a separate lane from events. They use the referenced
// sample's reception time, never the button time or the latest preview.
export function createMeasurementPoints(plot, onSelect) {
  const layer = element('div', 'measurement-point-markers'); layer.hidden = true; plot.append(layer);
  let records = [], context = null, columns = [], key = '', markers = [], dialog = null, returnFocus = null;
  const stamp = record => formatClockTime(clockTime(record.receivedAt));
  const label = number => formatCopy(getLabCopy(context).point.marker, { number });
  function showDetails(group, anchor) {
    dialog?.remove(); returnFocus = anchor;
    const copy = getLabCopy(context), pointCopy = copy.point;
    dialog = element('dialog', 'ui-dialog measurement-event-dialog'); dialog.dataset.dialogSize = 'compact';
    const header = element('header', 'ui-dialog-header'), heading = element('h2', 'ui-dialog-title', pointCopy.markerTitle);
    heading.id = 'measurement-point-title'; dialog.setAttribute('aria-labelledby', heading.id); header.append(heading);
    const body = element('div', 'ui-dialog-body'), list = element('ol');
    for (const record of group) {
      const item = element('li'); item.dataset.pointMarkerId = String(record.pointRecordId);
      item.append(element('strong', '', label(record.pointRecordId)), element('time', '', stamp(record)));
      if (columns[0]) {
        const column = columns[0], value = record.manualValues[column.id];
        item.append(element('p', '', `${column.name}: ${value === null ? pointCopy.conditionMissing : value + (column.unit ? ' ' + column.unit : '')}`));
      }
      item.append(element('p', 'lab-note', formatCopy(pointCopy.origin, { number: record.capturedSampleId })));
      const button = element('button', '', formatCopy(pointCopy.showRecord, { number: record.pointRecordId }));
      button.type = 'button'; button.dataset.uiAction = 'quiet'; button.dataset.pointOpen = String(record.pointRecordId);
      button.addEventListener('click', () => { returnFocus = null; dialog.close(); onSelect(record.pointRecordId); });
      item.append(button); list.append(item);
    }
    body.append(list);
    const footer = element('footer', 'ui-dialog-footer'), actions = element('div', 'ui-dialog-actions'), close = element('button', '', pointCopy.markerClose);
    close.type = 'button'; close.dataset.uiAction = 'quiet'; close.dataset.pointMarkerAction = 'close';
    close.addEventListener('click', () => dialog.close()); actions.append(close); footer.append(actions);
    dialog.append(header, body, footer); plot.after(dialog);
    dialog.addEventListener('close', () => {
      if (!returnFocus) return;
      const anchor = returnFocus.isConnected ? returnFocus : plot.closest('[data-screen="measure"]').querySelector('#point-panel > summary');
      anchor?.focus({ preventScroll: true }); returnFocus = null;
    });
    dialog.showModal();
  }
  return {
    render(nextRecords, nextContext, nextColumns = []) {
      if (records === nextRecords && context === nextContext && columns === nextColumns) return;
      records = nextRecords; context = nextContext; columns = nextColumns; key = '';
    },
    hasVisibleMarkers(from, to) { return records.some(record => record.receivedAt >= from && record.receivedAt <= to); },
    layout(geometry, offset = 0) {
      const groups = geometry?.width > 0 ? groupTimeMarkers(records, geometry) : [];
      layer.hidden = !groups.length;
      plot.dataset.pointMarkers = String(!!groups.length);
      const nextKey = JSON.stringify(groups.map(group => group.items.map(item => item.record.pointRecordId)));
      if (nextKey !== key) {
        key = nextKey;
        markers = groups.map(group => {
          const marker = element('div', 'measurement-point-marker'), button = element('button');
          const first = group.items[0].record;
          button.type = 'button'; button.dataset.uiAction = 'quiet'; button.setAttribute('aria-haspopup', 'dialog');
          button.dataset.pointMarker = String(first.pointRecordId);
          button.append(element('strong', '', group.items.length > 1 ? formatCopy(getLabCopy(context).point.markerGroup, { number: first.pointRecordId, count: group.items.length - 1 }) : label(first.pointRecordId)), element('time', '', stamp(first)));
          button.addEventListener('click', () => showDetails(group.items.map(item => item.record), button));
          const line = element('i'); line.setAttribute('aria-hidden', 'true'); marker.append(button, line);
          return { marker, button, line };
        });
        layer.replaceChildren(...markers.map(item => item.marker));
      }
      groups.forEach((group, index) => {
        const { button, line } = markers[index];
        button.style.cssText = `left:${group.left}px;top:${geometry.labelTop + offset}px;width:${group.width}px`;
        line.style.cssText = `left:${group.items[0].x}px;top:${geometry.top}px;height:${geometry.height}px`;
      });
    },
    reset() { records = []; columns = []; context = null; key = ''; markers = []; returnFocus = null; dialog?.remove(); dialog = null; layer.replaceChildren(); layer.hidden = true; delete plot.dataset.pointMarkers; },
    dispose() { returnFocus = null; dialog?.remove(); layer.remove(); delete plot.dataset.pointMarkers; },
  };
}
