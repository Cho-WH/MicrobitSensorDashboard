import { motionMagnetic } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';
import { decodeMagneticStatus } from '../magnetometer/codec.js';
import { MILLI_G_TO_SI } from '../../../domain/acceleration-units.js';

export function decodeMotionMagnetic(raw, metadata = {}) {
  const status = decodeMagneticStatus(raw, metadata);
  if (status) return status;
  const reading = decodeDecimalChannels(raw, motionMagnetic.channels, metadata);
  if (reading.type === 'reading') for (const channel of motionMagnetic.channels) {
    if (channel.quantity === 'acceleration' && reading.values[channel.id] !== null)
      reading.values[channel.id] *= MILLI_G_TO_SI;
  }
  return reading;
}

// Demonstration only: one magnetic pulse per 1.2 s revolution, r = 0.1 m.
// Values travel through the same five-field decoder as the real device.
export function mockMotionMagneticLine(monotonicMs) {
  const phase = monotonicMs / 1200 * 2 * Math.PI;
  const x = Math.round(4 * Math.PI ** 2 * .1 / 1.2 ** 2 / MILLI_G_TO_SI);
  const z = -1000, strength = Math.round(Math.hypot(x, z));
  const magnetic = 35 + 80 * Math.exp(8 * (Math.cos(phase) - 1));
  return `${x},0,${z},${strength},${magnetic}`;
}
