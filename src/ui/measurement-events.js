import { element } from './dom.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';
import { eventTitle, eventDetail } from './event-content.js';
import { groupTimeMarkers } from './time-markers.js';

const lifecycle = new Set(['recording-start','recording-paused','recording-resumed','measurement-end','additional-measurement']);
const stamp = (event, precise = false) => Number.isFinite(event.receivedAt) ? formatClockTime(clockTime(event.receivedAt)).slice(0, precise ? 12 : 8) : '시각 정보 없음';
const important = event => event.source === 'user' && !lifecycle.has(event.type);

// Display only: the list, labels and grouped markers share the stored events.
// Selecting a marker never selects, excludes or rewrites measurement samples.
export function createMeasurementEvents(list, plot, onEditNote = null) {
  const layer = element('div', 'measurement-event-markers'); plot.append(layer);
  const status = element('details', 'measurement-system-events');
  const statusTitle = element('summary'), statusList = element('ol');
  status.append(statusTitle, statusList); list.after(status);
  const dialog = element('dialog', 'ui-dialog measurement-event-dialog'); dialog.dataset.dialogSize='compact';
  const heading = element('h2', 'ui-dialog-title', '조작 기록'), detailList = element('ol'), close = element('button', '', '닫기');
  heading.id = 'measurement-event-title'; dialog.setAttribute('aria-labelledby', heading.id);
  const header=element('header','ui-dialog-header'), body=element('div','ui-dialog-body'), footer=element('footer','ui-dialog-footer'), actions=element('div','ui-dialog-actions');
  header.append(heading); body.append(detailList); actions.append(close); footer.append(actions);
  close.type = 'button'; close.dataset.eventAction='close'; dialog.append(header, body, footer); plot.after(dialog);
  let records = [], lastEvents = null, lastContext = null, markerKey = '', returnFocus = null;
  let markers = [];
  let writable = false;
  const title = event => eventTitle(event,lastContext);
  function showDetails(events, anchor) {
    returnFocus = anchor;
    detailList.replaceChildren(...events.map(event => {
      const item = element('li'); item.append(element('strong', '', title(event)), element('time', '', stamp(event,true)));
      const detail=eventDetail(event,lastContext);if(detail)item.append(element('p','',detail));
      if (event.payload?.note) item.append(element('p', '', event.payload.note));
      if(writable && onEditNote && event.source==='user') {
        const edit=element('button','event-note-edit',event.payload?.note?'메모 수정':'메모 추가');edit.type='button';edit.dataset.eventId=String(event.eventId);
        edit.addEventListener('click',()=>{dialog.close();onEditNote(event);});item.append(edit);
      }
      return item;
    }));
    dialog.showModal();
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    // Live time windows may remove or regroup the original marker while open.
    const anchor = returnFocus?.isConnected ? returnFocus : list.querySelector('button');
    anchor?.focus({preventScroll:true}); returnFocus = null;
  });
  function row(event, interactive) {
    const item = element('li'), content = element(interactive ? 'button' : 'div', 'measurement-event-row');
    content.append(element('strong', '', title(event)), element('time', '', stamp(event)));
    if (event.payload?.note) content.append(element('span', 'measurement-event-excerpt', event.payload.note));
    if (interactive) {
      content.setAttribute('type', 'button');
      content.setAttribute('aria-haspopup', 'dialog');
      content.addEventListener('click', () => showDetails([event], content));
    }
    item.append(content); return item;
  }
  return {
    hasVisibleMarkers(from, to) {
      return records.some(event => Number.isFinite(event.receivedAt) && event.receivedAt >= from && event.receivedAt <= to);
    },
    render(events, context, canEdit = false) {
      if (lastEvents === events && lastContext === context && writable === canEdit) return;
      writable=canEdit;
      if (lastContext !== context) markerKey = '';
      lastEvents = events; lastContext = context;
      records = events.filter(important);
      list.replaceChildren(...records.slice(-100).reverse().map(event => row(event, true)));
      const system = events.filter(event => !important(event));
      status.hidden = !system.length;
      statusTitle.textContent = `기록·수신 상태 · ${system.length > 100 ? '최근 100' : system.length}건`;
      statusList.replaceChildren(...system.slice(-100).reverse().map(event => row(event, false)));
      list.setAttribute('aria-label', '최근 조작과 메모, 최대 100건');
    },
    layout(geometry) {
      if (!geometry || geometry.width < 1) { layer.hidden = true; return; }
      layer.hidden = false;
      const groups = groupTimeMarkers(records, geometry);
      const key = JSON.stringify(groups.map(group => group.items.map(item => [item.record.eventId, item.record.receivedAt, item.record.type, item.record.payload?.note])));
      if (key !== markerKey) {
        markerKey = key;
        markers = groups.map(group => {
          const marker = element('div', 'measurement-event-marker'), button = element('button');
          button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
          const first = group.items[0].record;
          button.append(element('strong', '', title(first) + (group.items.length > 1 ? ` 외 ${group.items.length - 1}건` : '')),
            element('time', '', stamp(first) + (group.items.length > 1 ? ' …' : '')));
          button.addEventListener('click', () => showDetails(group.items.map(item => item.record), button));
          // A grouped label points to its first event; the detail dialog lists
          // every exact timestamp, including events during a measurement gap.
          const line = element('i'); line.setAttribute('aria-hidden', 'true');
          marker.append(button, line); return {marker, button, line};
        });
        layer.replaceChildren(...markers.map(item => item.marker));
      }
      groups.forEach((group, index) => {
        const {button, line} = markers[index];
        button.style.cssText = `left:${group.left}px;top:${geometry.labelTop}px;width:${group.width}px`;
        line.style.cssText = `left:${group.items[0].x}px;top:${geometry.top}px;height:${geometry.height}px`;
      });
    },
    dispose() { returnFocus=null; dialog.remove(); layer.remove(); status.remove(); list.replaceChildren(); },
  };
}
