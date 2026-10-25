import { accelerometer } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';
import { MILLI_G_TO_SI } from '../../../domain/acceleration-units.js';

/** Firmware sends milli-g; each accepted sample enters the app in m/s², without rounding. */
export function decodeAccelerometer(raw, metadata = {}) {
  const reading = decodeDecimalChannels(raw, accelerometer.channels, metadata);
  if (reading.type === 'reading') for (const id of Object.keys(reading.values)) {
    if (reading.values[id] !== null) reading.values[id] *= MILLI_G_TO_SI;
  }
  return reading;
}

/** Explicit demonstration input; resting gravity is about 1000 milli-g. */
export function mockAccelerometerLine(monotonicMs) {
  const t = monotonicMs / 1000;
  const x = Math.round(120 * Math.sin(t / 3)), y = Math.round(80 * Math.sin(t / 4));
  const z = -1000 + Math.round(50 * Math.sin(t / 5));
  return `${x},${y},${z},${Math.round(Math.hypot(x, y, z))}`;
}
