/** Activity rules stay outside generic recording and analysis. */
export function reduceActivity(state = {}, command, facts) {
  if (!facts.recording) return { nextState: state, events: [], error: '기록 시작 후 조작을 기록하세요.' };
  if ((command.type === 'placement' && state.placed) || (command.type === 'heating-start' && state.heating)) return { nextState: state, events: [], error: '이미 기록한 조작입니다.' };
  if (command.type === 'heating-start' && !facts.reception?.ready) return { nextState: state, events: [], error: '안정적인 센서 수신을 확인한 뒤 가열하세요.' };
  if (command.type === 'heating-start' && !state.placed) return { nextState: state, events: [], error: '장치 배치를 먼저 확인하세요.' };
  const allowed = ['placement', 'heating-start', 'water-added'];
  if (!allowed.includes(command.type)) return { nextState: state, events: [], error: '알 수 없는 활동 조작입니다.' };
  return { nextState: { ...state, placed: state.placed || command.type === 'placement', heating: state.heating || command.type === 'heating-start' }, events: [{ type: command.type, payload: command.payload ?? {}, source: 'user' }] };
}
export const activityPolicy = { initialState: {}, reduceActivity, restore(events) {
  const phase = events.slice(events.findLastIndex(e => e.type === 'additional-measurement') + 1);
  return { placed: phase.some(e => e.type === 'placement'), heating: phase.some(e => e.type === 'heating-start') };
}, validateAdditional(confirmation) {
  if (!confirmation.sameContainer || !confirmation.sameGas || !confirmation.samePosition) throw new Error('용기·기체의 양·센서 위치를 확인하세요.');
  return structuredClone(confirmation);
} };
