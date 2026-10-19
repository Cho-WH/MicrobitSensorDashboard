import { bmp280 } from './definition.js';
// Original G decoder's strict decimal/exponent grammar; malformed channels remain independent.
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
/** Decode the original temperature, unsupported humidity slot, pressure protocol. */
export function decodeBmp280(raw, { receivedAt = Date.now(), monotonicAt = 0, attemptId = 0 } = {}) {
  const base = { receivedAt, monotonicAt, attemptId };
  if (typeof raw !== 'string' || raw.trim().split(',').length !== 3) return { type: 'parse-error', reasonCode: 'field-count', ...base };
  const parts = raw.trim().split(','), values = {}, validity = {};
  for (const [index, channel] of [[0, bmp280.channels[0]], [2, bmp280.channels[1]]]) {
    const token = parts[Number(index)].trim(), c = /** @type {import('../../../domain/columns.js').Channel} */ (channel);
    const value = token === '' || !NUMBER.test(token) ? null : Number(token);
    values[c.id] = Number.isFinite(value) ? value : null;
    validity[c.id] = token === '' ? 'missing' : !Number.isFinite(value) ? 'error' : value < c.min || value > c.max ? 'out-of-range' : 'valid';
  }
  return { type: 'reading', values, validity, rawExtra: { humidityToken: parts[1], humidityValidity: 'unsupported' }, ...base };
}

/** Explicit demonstration input; this is never presented as a physical sensor measurement. */
export function mockBmp280Line(monotonicMs) {
  const t = monotonicMs / 1000, temperature = 24 + Math.sin(t / 8) * 3;
  return `${temperature},0,${1000 + (temperature - 24) * 3.4 + Math.sin(t) * .15}`;
}
