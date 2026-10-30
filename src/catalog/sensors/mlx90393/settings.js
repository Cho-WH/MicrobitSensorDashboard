export const presets = [
  { id: 'normal', name: '작은 변화', description: '코일이나 떨어진 자석이 만드는 작은 자기장 변화를 자세히 관찰해요.', scales: [0.150, 0.150, 0.242] },
  { id: 'wide', name: '강한 자석', description: '더 강한 자기장까지 측정해요. 작은 변화를 구분하는 능력은 낮아져요.', scales: [1.502, 1.502, 2.420] },
];
export const axes = ['X', 'Y', 'Z'];
export function normalizeSettings(value) {
  if (value == null) return { version: 1, preset: 'normal' };
  if (value.version !== 1 || !presets.some(p => p.id === value.preset)) throw new Error('이 실험의 자기장 설정을 지원하지 않습니다. 새 실험을 준비하세요.');
  return { version: 1, preset: value.preset };
}
export function configureContext(context, settings) {
  const normalized = normalizeSettings(settings);
  return { ...context, setup: { ...context.setup, sensorSettings: normalized } };
}
