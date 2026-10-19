// Preserve the original Gay-Lussac decoder's strict decimal/exponent grammar.
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
/** @typedef {{type:'parse-error',reasonCode:'field-count',receivedAt:number,monotonicAt:number,attemptId:number}} ParseError */

/** Decode one decimal CSV field per channel, keeping each channel's validity independent.
 * @param {unknown} raw
 * @param {import('../../../domain/columns.js').Channel[]} channels
 * @param {{receivedAt?:number,monotonicAt?:number,attemptId?:number}} metadata
 * @returns {import('../../../domain/contracts.js').Reading | ParseError}
 */
export function decodeDecimalChannels(raw, channels, { receivedAt = Date.now(), monotonicAt = 0, attemptId = 0 } = {}) {
  const base = { receivedAt, monotonicAt, attemptId };
  if (typeof raw !== 'string') return { type: 'parse-error', reasonCode: 'field-count', ...base };
  const tokens = raw.split(',');
  if (tokens.length !== channels.length) return { type: 'parse-error', reasonCode: 'field-count', ...base };
  /** @type {Record<string, number|null>} */
  const values = {};
  /** @type {Record<string, string>} */
  const validity = {};
  for (const [index, channel] of channels.entries()) {
    const token = tokens[index].trim();
    const value = token && NUMBER.test(token) ? Number(token) : null;
    values[channel.id] = Number.isFinite(value) ? value : null;
    validity[channel.id] = !token ? 'missing' : !Number.isFinite(value) ? 'error'
      : (channel.min != null && value < channel.min) || (channel.max != null && value > channel.max) ? 'out-of-range' : 'valid';
  }
  return { type: 'reading', values, validity, ...base };
}
