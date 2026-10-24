import { element } from './dom.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';

const lifecycle = new Set(['recording-start','recording-paused','recording-resumed','measurement-end','additional-measurement']);
const labels = {'recording-start':'기록 시작','recording-paused':'일시정지','recording-resumed':'기록 재개','measurement-end':'기록 마침',note:'메모','additional-measurement':'추가 측정',discontinuity:'측정 공백','reception-change':'수신 상태 변경',interrupted:'중단 후 복원','parse-error':'수신값 확인 필요'};
const stamp = (event, precise = false) => Number.isFinite(event.receivedAt) ? formatClockTime(clockTime(event.receivedAt)).slice(0, precise ? 12 : 8) : '시각 정보 없음';
const important = event => event.source === 'user' && !lifecycle.has(event.type);

// Display only: the list, labels and grouped markers share the stored events.
// Selecting a marker never selects, excludes or rewrites measurement samples.
export function createMeasurementEvents(list, plot) {
  const layer = element('div', 'measurement-event-markers'); plot.append(layer);
  const status = element('details', 'measurement-system-events');
  const statusTitle = element('summary'), statusList = element('ol');
  status.append(statusTitle, statusList); list.after(status);
  const dialog = element('dialog', 'measurement-event-dialog');
  const heading = element('h2', '', '조작 기록'), detailList = element('ol'), close = element('button', '', '닫기');
  heading.id = 'measurement-event-title'; dialog.setAttribute('aria-labelledby', heading.id);
  close.type = 'button'; dialog.append(heading, detailList, close); plot.after(dialog);
  let records = [], names = {}, lastEvents = null, lastContext = null, markerKey = '', returnFocus = null;
  let markers = [];
  const title = event => names[event.type] ?? labels[event.type] ?? event.type;
  function showDetails(events, anchor) {
    returnFocus = anchor;
    detailList.replaceChildren(...events.map(event => {
      const item = element('li'); item.append(element('strong', '', title(event)), element('time', '', stamp(event,true)));
      if (event.payload?.note) item.append(element('p', '', event.payload.note));
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
    render(events, context) {
      if (lastEvents === events && lastContext === context) return;
      if (lastContext !== context) markerKey = '';
      lastEvents = events; lastContext = context;
      names = Object.fromEntries((context?.activity?.events ?? []).map(event => [event.type, event.label]));
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
      const width = Math.min(116, geometry.width), gap = 8, groups = [];
      const visible = records.filter(event => Number.isFinite(event.receivedAt))
        .map(event => ({event, x:geometry.pixel(event.receivedAt)}))
        .filter(item => item.x >= geometry.left && item.x <= geometry.left + geometry.width)
        .sort((a,b) => a.x - b.x);
      for (const item of visible) {
        const left = Math.max(geometry.left, Math.min(item.x - width / 2, geometry.left + geometry.width - width));
        const previous = groups.at(-1);
        if (previous && left < previous.left + width + gap) previous.items.push(item);
        else groups.push({left, items:[item]});
      }
      const key = JSON.stringify(groups.map(group => group.items.map(item => [item.event.eventId, item.event.receivedAt, item.event.type, item.event.payload?.note])));
      if (key !== markerKey) {
        markerKey = key;
        markers = groups.map(group => {
          const marker = element('div', 'measurement-event-marker'), button = element('button');
          button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
          const first = group.items[0].event;
          button.append(element('strong', '', title(first) + (group.items.length > 1 ? ` 외 ${group.items.length - 1}건` : '')),
            element('time', '', stamp(first) + (group.items.length > 1 ? ' …' : '')));
          button.addEventListener('click', () => showDetails(group.items.map(item => item.event), button));
          // A grouped label points to its first event; the detail dialog lists
          // every exact timestamp, including events during a measurement gap.
          const line = element('i'); line.setAttribute('aria-hidden', 'true');
          marker.append(button, line); return {marker, button, line};
        });
        layer.replaceChildren(...markers.map(item => item.marker));
      }
      groups.forEach((group, index) => {
        const {button, line} = markers[index];
        button.style.cssText = `left:${group.left}px;top:${Math.max(0, geometry.top - 48)}px;width:${width}px`;
        line.style.cssText = `left:${group.items[0].x}px;top:${geometry.top}px;height:${geometry.height}px`;
      });
    },
    dispose() { returnFocus=null; dialog.remove(); layer.remove(); status.remove(); list.replaceChildren(); },
  };
}
