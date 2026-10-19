import { temperature } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';

/** One board-temperature field in degrees Celsius. */
export function decodeTemperature(raw, metadata = {}) {
  return decodeDecimalChannels(raw, temperature.channels, metadata);
}

/** Explicit demonstration input, independent of any attached device. */
export function mockTemperatureLine(monotonicMs) {
  return String(Math.round(24 + 3 * Math.sin(monotonicMs / 15000)));
}
