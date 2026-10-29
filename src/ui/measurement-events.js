import { element } from './dom.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';
import { isExperimentMemo } from '../domain/contracts.js';
import { groupTimeMarkers } from './time-markers.js';

const stamp = (event, precise = false) => Number.isFinite(event.receivedAt) ? formatClockTime(clockTime(event.receivedAt)).slice(0, precise ? 12 : 8) : '시각 정보 없음';
const important = event => isExperimentMemo(event) && !event.payload.withdrawn;

// Display only: marker selection is supplied by the memo view through its caller.
// Selecting a marker never selects, excludes or rewrites measurement samples.
export function createMeasurementEvents(plot, onEditNote = null, onReturnFocus = () => {}) {
  const layer = element('div', 'measurement-event-markers'); plot.append(layer);
  const dialog = element('dialog', 'ui-dialog measurement-event-dialog'); dialog.dataset.dialogSize='compact';
  const heading = element('h2', 'ui-dialog-title', '실험 메모'), detailList = element('ol'), close = element('button', '', '닫기');
  heading.id = 'measurement-event-title'; dialog.setAttribute('aria-labelledby', heading.id);
  const header=element('header','ui-dialog-header'), body=element('div','ui-dialog-body'), footer=element('footer','ui-dialog-footer'), actions=element('div','ui-dialog-actions');
  header.append(heading); body.append(detailList); actions.append(close); footer.append(actions);
  close.type = 'button'; close.dataset.eventAction='close'; dialog.append(header, body, footer); plot.after(dialog);
  let records = [], lastEvents = null, lastContext = null, markerKey = '', returnFocus = null, pendingEdit = null;
  let markers = [];
  let writable = false, selectedId = null;
  const title = event => event.payload.note || '빈 메모';
  function showDetails(events, anchor) {
    returnFocus = anchor;
    detailList.replaceChildren(...events.map(event => {
      const item = element('li'); item.append(element('strong', '', title(event)), element('time', '', stamp(event,true)));

      if(writable && onEditNote && event.source==='user') {
        const edit=element('button','event-note-edit','메모 편집');edit.type='button';edit.dataset.eventId=String(event.eventId);
        edit.addEventListener('click',()=>{pendingEdit=event;dialog.close();});item.append(edit);
      }
      return item;
    }));
    dialog.showModal();
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if(pendingEdit) { const event=pendingEdit;pendingEdit=null;returnFocus=null;onEditNote?.(event);return; }
    // Live time windows may remove or regroup the original marker while open.
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    else onReturnFocus();
    returnFocus = null;
  });
  return {
    hasVisibleMarkers(from, to) {
      return records.some(event => Number.isFinite(event.receivedAt) && event.receivedAt >= from && event.receivedAt <= to);
    },
    render(events, context, canEdit = false, selected = null) {
      selectedId=selected;
      if (lastEvents === events && lastContext === context && writable === canEdit) return;
      writable=canEdit;
      if (lastContext !== context) markerKey = '';
      lastEvents = events; lastContext = context;
      records = events.filter(important);
    },
    layout(geometry) {
      if (!geometry || geometry.width < 1) { layer.hidden = true; return; }
      layer.hidden = false;
      const groups = groupTimeMarkers(records, geometry);
      const key = JSON.stringify(groups.map(group => group.items.map(item => [item.record.runId, item.record.eventId, item.record.receivedAt, item.record.payload?.note])));
      if (key !== markerKey) {
        markerKey = key;
        markers = groups.map(group => {
          const marker = element('div', 'measurement-event-marker'), button = element('button');
          button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
          const first = group.items[0].record;
          button.dataset.memoIds=group.items.map(item=>item.record.eventId).join(',');
          button.append(element('strong', '', title(first) + (group.items.length > 1 ? ` 외 ${group.items.length - 1}건` : '')),
            element('time', '', stamp(first) + (group.items.length > 1 ? ' …' : '')));
          button.addEventListener('click', () => {
            if(group.items.length===1 && onEditNote) onEditNote(first);
            else showDetails(group.items.map(item => item.record), button);
          });
          // A grouped label points to its first event; the detail dialog lists
          // every exact timestamp, including events during a measurement gap.
          const line = element('i'); line.setAttribute('aria-hidden', 'true');
          marker.append(button, line); return {marker, button, line};
        });
        layer.replaceChildren(...markers.map(item => item.marker));
      }
      groups.forEach((group, index) => {
        const {button, line} = markers[index];
        button.dataset.selected=String(group.items.some(item=>item.record.eventId===selectedId));
        button.style.cssText = `left:${group.left}px;top:${geometry.labelTop}px;width:${group.width}px`;
        line.style.cssText = `left:${group.items[0].x}px;top:${geometry.top}px;height:${geometry.height}px`;
      });
    },
    dispose() { returnFocus=null; dialog.remove(); layer.remove();  },
  };
}
