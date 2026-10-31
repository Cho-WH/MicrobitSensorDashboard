/** Convert a single CSS time to milliseconds for browser animation/timer APIs.
 * CSS minification may change equivalent units (for example, ms to s).
 * @param {string} value */
export function cssTimeMilliseconds(value) {
  const match = value.trim().match(/^([+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?)(ms|s)$/i);
  if (!match) return 0;
  const milliseconds = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}
