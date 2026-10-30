import { presets, axes } from './settings.js';
// The framing carries the applied preset and request token: old notifications cannot
// be interpreted using a newer gain after a setting change.
export function decodeMlx90393(raw, { receivedAt = Date.now(), monotonicAt = 0, attemptId = 0 } = {}) {
  const base = { receivedAt, monotonicAt, attemptId }, parts = typeof raw === 'string' ? raw.trim().split(',') : [];
  const fail = () => ({ type: 'parse-error', reasonCode: 'mlx-frame', ...base });
  if (parts[0] === '@mlx' && parts[1] === '1') {
    if (parts.length === 3 && parts[2] === 'ready') return { type: 'device-status', status: 'ready', ...base };
    if (parts.length === 4 && parts[2] === 'error' && /^\d+$/.test(parts[3])) return { type: 'device-status', status: 'error', token: Number(parts[3]), ...base };
    if (parts.length === 5 && parts[2] === 'applied' && presets.some(p => p.id === parts[3]) && /^\d+$/.test(parts[4]))
      return { type: 'device-status', status: 'applied', preset: parts[3], token: Number(parts[4]), ...base };
    return fail();
  }
  const preset = presets.find(p => p.id === parts[2]);
  if (parts.length !== 7 || parts[0] !== 'mlx' || parts[1] !== '1' || !preset || !/^\d+$/.test(parts[3])) return fail();
  const counts = parts.slice(4).map(s => /^-?\d+$/.test(s) ? Number(s) : NaN);
  if (counts.some(n => !Number.isInteger(n) || n < -32768 || n > 32767)) return fail();
  const keys = [...axes, 'Strength'].map(a => 'magnetic' + a);
  const values = Object.fromEntries(keys.map(k => [k, null])), validity = Object.fromEntries(keys.map(k => [k, 'missing']));
  for (const [i, axis] of axes.entries()) {
    const value = counts[i] * preset.scales[i];
    values['magnetic' + axis] = value;
    validity['magnetic' + axis] = counts[i] <= -32768 || counts[i] >= 32767 || Math.abs(value) >= 50000 ? 'out-of-range' : 'valid';
  }
  const valid = axes.every(a => validity['magnetic' + a] === 'valid');
  values.magneticStrength = valid ? Math.hypot(...axes.map(a => values['magnetic' + a])) : null;
  validity.magneticStrength = valid ? 'valid' : 'error';
  return { type: 'reading', preset: preset.id, token: Number(parts[3]), values, validity,
    warning: valid ? '' : '측정 범위를 넘었어요. 자석을 떨어뜨리거나 장치·실험 설정에서 측정 모드를 바꾸세요. 기록을 시작했다면 새 실험으로 바꿀 수 있어요.', ...base };
}
export function mockMlx90393Line(ms) {
  return `mlx,1,normal,1,${Math.round(120 * Math.sin(ms / 3000))},100,150`;
}
