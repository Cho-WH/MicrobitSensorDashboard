import { magnetometer } from './definition.js';
// Reuse the original Gay-Lussac decoder's decimal/exponent token grammar.
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
export function decodeMagnetometer(raw, { receivedAt = Date.now(), monotonicAt = 0, attemptId = 0 } = {}) {
  const base = { receivedAt, monotonicAt, attemptId };
  if (typeof raw !== 'string' || raw.split(',').length !== 4) return { type: 'parse-error', reasonCode: 'field-count', ...base };
  const tokens = raw.split(','), values = {}, validity = {};
  for (const [index, channel] of magnetometer.channels.entries()) {
    const token = tokens[index].trim(), value = token && NUMBER.test(token) ? Number(token) : null;
    values[channel.id] = Number.isFinite(value) ? value : null;
    validity[channel.id] = !token ? 'missing' : !Number.isFinite(value) ? 'error'
      : channel.min != null && value < channel.min ? 'out-of-range' : 'valid';
  }
  return { type: 'reading', values, validity, ...base };
}

/** Explicit demonstration input generated independently of any attached device. */
export function mockMagnetometerLine(monotonicMs) {
  const t = monotonicMs / 1000, x = 20 * Math.sin(t / 3), y = 15 * Math.cos(t / 4), z = 35 + 3 * Math.sin(t / 5);
  return `${x},${y},${z},${Math.hypot(x, y, z)}`;
}
