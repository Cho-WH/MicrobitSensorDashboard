import { getActivityPolicy } from '../catalog/index.js';
import { element } from './dom.js';

const labels = {'recording-start':'기록 시작','recording-paused':'일시정지','recording-resumed':'기록 재개','measurement-end':'기록 마침',note:'메모','additional-measurement':'추가 측정',discontinuity:'측정 공백','reception-change':'수신 상태 변경',interrupted:'중단 후 복원',resumed:'이어 측정','parse-error':'수신값 확인 필요'};
export const eventTitle = event => labels[event.type] ?? event.type;
export function eventDetail(event, context) {
  if (event.type === 'additional-measurement') {
    const conditions = getActivityPolicy(context)?.additionalConditions ?? [];
    const states = {same:'변경 없음',changed:'변경됨',unsure:'확실하지 않음'};
    return conditions.filter(item=>event.payload.conditions?.[item.id]).map(item=>`${item.label}: ${states[event.payload.conditions[item.id]] ?? '미확인'}`).join(' · ');
  }
  return '';
}
export function renderEventList(list, events, context, onEdit = null) {
  // Keep edit anchors alive while a shared popover commits and returns focus.
  const rows = new Map([...list.children].map(row => [row.dataset.eventRowId, row]));
  const focused = list.contains(document.activeElement) ? document.activeElement : null;
  list.replaceChildren(...events.map(event=>{
    const li=rows.get(String(event.eventId)) ?? element('li','stored-event');
    li.dataset.eventRowId=String(event.eventId);
    const text=li.querySelector('span') ?? element('span');
    text.textContent=[new Date(event.receivedAt).toLocaleTimeString('ko-KR'),eventTitle(event),eventDetail(event,context),event.payload.note,event.payload.withdrawn ? '취소됨' : ''].filter(Boolean).join(' · ');
    const button=li.querySelector('button') ?? element('button','event-note-edit');
    li.replaceChildren(text);
    if(onEdit && event.source==='user') {
      button.textContent=event.payload.note?'메모 수정':'메모 추가';
      button.type='button';button.dataset.eventId=String(event.eventId);button.setAttribute('aria-label',eventTitle(event)+' '+button.textContent);
      button.onclick=()=>onEdit(event);li.append(button); }
    return li;
  }));
  if (focused instanceof HTMLElement && focused.isConnected) focused.focus({preventScroll:true});
}
