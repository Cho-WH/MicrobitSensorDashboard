export const WIRING_CHANNEL = 'sensor-lab-wiring';
export const WIRING_VERSION = 1;
export function validateViewerOptions(choices, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('잘못된 보기 설정입니다.');
  for (const [key, value] of Object.entries(options)) {
    if (!choices.some(choice => choice.id === key && choice.values.some(option => option.id === value))) throw new Error('지원하지 않는 보기 설정입니다.');
  }
  return { ...options };
}
export function validateViewerState(setup, state) {
  if (!state || !['iso', 'front', 'back', 'connector'].includes(state.view)
    || (state.wire !== null && !setup.wiring.some(item => item.id === state.wire))
    || !Number.isInteger(state.explosion) || state.explosion < 0 || state.explosion > 60) throw new Error('잘못된 배선 보기입니다.');
  return { view: state.view, wire: state.wire, explosion: state.explosion,
    options: { ...setup.defaults, ...validateViewerOptions(setup.choices, state.options ?? {}) } };
}
