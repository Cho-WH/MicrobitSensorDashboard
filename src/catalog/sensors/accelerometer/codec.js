import { accelerometer } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';

/** X, Y, Z and magnitude fields in milli-g, in firmware transmission order. */
export function decodeAccelerometer(raw, metadata = {}) {
  return decodeDecimalChannels(raw, accelerometer.channels, metadata);
}

/** Explicit demonstration input; resting gravity is about 1000 milli-g. */
export function mockAccelerometerLine(monotonicMs) {
  const t = monotonicMs / 1000;
  const x = Math.round(120 * Math.sin(t / 3)), y = Math.round(80 * Math.sin(t / 4));
  const z = -1000 + Math.round(50 * Math.sin(t / 5));
  return `${x},${y},${z},${Math.round(Math.hypot(x, y, z))}`;
}
