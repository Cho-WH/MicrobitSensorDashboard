// Archived 2026-10-30 for possible inquiry activities. Not imported by the app.
// Software background subtraction, not sensor calibration. Keep the source
// reading separately: subtraction returns a derived reading without mutation.
const axes = ['X', 'Y', 'Z'];
const validVector = reading => reading.type === 'reading' && axes.every(axis =>
  reading.validity['magnetic' + axis] === 'valid' && Number.isFinite(reading.values['magnetic' + axis]));

// The former MLX preparation logic: 10 consecutive valid samples spanning at
// least 700 ms, all received in the last 1.5 s. Reset when setup/connection changes.
export function createBackgroundCapture() {
  let recent = [];
  return {
    add(reading) {
      if (!validVector(reading)) { recent = []; return; }
      recent.push(structuredClone(reading));
      recent = recent.filter(r => reading.monotonicAt - r.monotonicAt <= 1500).slice(-10);
    },
    capture(now) {
      const fresh = recent.filter(r => now >= r.monotonicAt && now - r.monotonicAt <= 1500);
      if (fresh.length < 10 || fresh.at(-1).monotonicAt - fresh[0].monotonicAt < 700)
        throw new Error('A fresh, consecutive background sample window is required.');
      return { vector: axes.map(axis => fresh.reduce((sum, r) => sum + r.values['magnetic' + axis], 0) / fresh.length),
        at: fresh.at(-1).receivedAt };
    },
    reset() { recent = []; },
  };
}

export function subtractBackground(reading, background) {
  if (!Array.isArray(background.vector) || background.vector.length !== 3 || !background.vector.every(Number.isFinite))
    throw new Error('Three finite background components are required.');
  const result = structuredClone(reading);
  if (reading.type !== 'reading') return result;
  for (const [i, axis] of axes.entries()) {
    const key = 'magnetic' + axis;
    result.values[key] = reading.validity[key] === 'valid' ? reading.values[key] - background.vector[i] : null;
  }
  const valid = validVector(reading);
  result.values.magneticStrength = valid ? Math.hypot(...axes.map(axis => result.values['magnetic' + axis])) : null;
  result.validity.magneticStrength = valid ? 'valid' : 'error';
  return result;
}
