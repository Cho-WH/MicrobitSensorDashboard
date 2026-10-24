/** Activity rules stay outside generic recording and analysis. */
// Conditions and event kinds adapted from bme280@59c5c149 gay-lussac/measurement/conditions.js.
export const additionalConditions = [
  { id: 'container', label: '용기와 기체가 차지하는 부피' },
  { id: 'seal', label: '밀폐 상태와 뚜껑 개방 여부' },
  { id: 'sensor', label: '센서 위치·배선·측정 설정' },
];
export function reduceActivity(state = {}, command, facts) {
  const reject = error => ({ nextState: state, events: [], error });
  if (!facts.recording && !(facts.state === 'paused' && ['water-added', 'device-change'].includes(command.type))) return reject('기록 시작 후 조작을 기록하세요.');
  if (command.type === 'device-change' && !['moved', 'opened', 'sealed'].includes(command.payload?.kind)) return reject('장치의 변화 종류를 선택하세요.');
  if (command.payload?.note != null && (typeof command.payload.note !== 'string' || command.payload.note.length > 500)) return reject('메모는 500자 이내로 적어 주세요.');
  if ((command.type === 'placement' && state.placed) || (command.type === 'heating-start' && state.heating)) return { nextState: state, events: [], error: '이미 기록한 조작입니다.' };
  if (command.type === 'heating-start' && !facts.reception?.ready) return { nextState: state, events: [], error: '안정적인 센서 수신을 확인한 뒤 가열하세요.' };
  if (command.type === 'heating-start' && !state.placed) return { nextState: state, events: [], error: '장치 배치를 먼저 확인하세요.' };
  const allowed = ['placement', 'heating-start', 'water-added', 'device-change'];
  if (!allowed.includes(command.type)) return { nextState: state, events: [], error: '알 수 없는 활동 조작입니다.' };
  return { nextState: { ...state, placed: state.placed || command.type === 'placement', heating: state.heating || command.type === 'heating-start' }, events: [{ type: command.type, payload: command.payload ?? {}, source: 'user' }] };
}
export const activityPolicy = { initialState: {}, reduceActivity, additionalConditions, restore(events) {
  const phase = events.slice(events.findLastIndex(e => e.type === 'additional-measurement') + 1);
  return { placed: phase.some(e => e.type === 'placement'), heating: phase.some(e => e.type === 'heating-start') };
}, validateAdditional(confirmation) {
  const conditions = Object.fromEntries(additionalConditions.map(({id}) => {
    const value = confirmation.conditions?.[id];
    if (!['same', 'changed', 'unsure'].includes(value)) throw new Error('각 조건의 변경 여부를 선택하세요.');
    return [id, value];
  }));
  if (typeof confirmation.note !== 'string' || confirmation.note.length > 500) throw new Error('메모는 500자 이내로 적어 주세요.');
  const note = confirmation.note.trim();
  if (Object.values(conditions).some(value => value !== 'same') && !note) throw new Error('달라졌거나 확실하지 않은 조건을 메모해 주세요.');
  return { sameContext: confirmation.sameContext === true, conditions, note };
} };
