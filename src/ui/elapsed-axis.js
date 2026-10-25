// Shared display policy for elapsed seconds, independent of dates/time zones.
// Choose precision once per axis; never round the underlying samples.
export function createElapsedAxis(ticks = []) {
  const values = [...new Set(ticks.filter(Number.isFinite))].sort((a, b) => a - b);
  const steps = values.slice(1).map((value, index) => value - values[index]);
  const step = steps.length ? Math.min(...steps) : 1;
  const milliseconds = values.map(value => Math.round(value * 1000));
  const digits = [0, 1, 2, 3].find(digit => step + 1e-9 >= 1 / 10 ** digit
    && milliseconds.every(value => value % (1000 / 10 ** digit) === 0)) ?? 3;
  const seconds = step < 60 || milliseconds.some(value => value % 60000 !== 0);
  const minutes = seconds || step < 3600 || milliseconds.some(value => value % 3600000 !== 0);
  return value => {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 1000), magnitude = Math.abs(rounded);
    const hours = Math.floor(magnitude / 3600000), mins = Math.floor(magnitude / 60000) % 60;
    const parts = [];
    if (hours) parts.push(`${hours}시간`);
    if (minutes && (mins || hours)) parts.push(`${mins}분`);
    if (seconds) {
      const secs = Math.floor(magnitude / 1000) % 60;
      const fraction = digits ? '.' + String(magnitude % 1000).padStart(3, '0').slice(0, digits) : '';
      parts.push(`${secs}${fraction}초`);
    }
    if (!parts.length) parts.push(minutes ? '0분' : '0시간');
    return (rounded < 0 ? '−' : '') + parts.join(' ');
  };
}
