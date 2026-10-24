import { getActivityEvents, getActivityPolicy } from '../catalog/index.js';
import { element } from './dom.js';

const labels = {'recording-start':'기록 시작','recording-paused':'일시정지','recording-resumed':'기록 재개','measurement-end':'기록 마침',note:'메모','additional-measurement':'추가 측정',discontinuity:'측정 공백','reception-change':'수신 상태 변경',interrupted:'중단 후 복원',resumed:'이어 측정','parse-error':'수신값 확인 필요'};
export const eventTitle = (event, context) => getActivityEvents(context).find(item=>item.type===event.type)?.label ?? labels[event.type] ?? event.type;
export function eventDetail(event, context) {
  const definition = getActivityEvents(context).find(item=>item.type===event.type);
  if (definition?.kinds) return definition.kinds.find(item=>item.id===event.payload.kind)?.label ?? '';
  if (event.type === 'additional-measurement') {
    const conditions = getActivityPolicy(context)?.additionalConditions ?? [];
    const states = {same:'변경 없음',changed:'변경됨',unsure:'확실하지 않음'};
    return conditions.filter(item=>event.payload.conditions?.[item.id]).map(item=>`${item.label}: ${states[event.payload.conditions[item.id]] ?? '미확인'}`).join(' · ');
  }
  return '';
}
export function renderEventList(list, events, context, onEdit = null) {
  list.replaceChildren(...events.map(event=>{
    const li=element('li','stored-event'), text=element('span');
    text.textContent=[new Date(event.receivedAt).toLocaleTimeString('ko-KR'),eventTitle(event,context),eventDetail(event,context),event.payload.note].filter(Boolean).join(' · ');
    li.append(text);
    if(onEdit && event.source==='user') { const button=element('button','event-note-edit',event.payload.note?'메모 수정':'메모 추가');
      button.type='button';button.dataset.eventId=String(event.eventId);button.setAttribute('aria-label',eventTitle(event,context)+' '+button.textContent);
      button.addEventListener('click',()=>onEdit(event));li.append(button); }
    return li;
  }));
}
