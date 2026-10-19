import { lightLevel } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';

/** One relative-light field, preserving finite values outside 0–255 for review. */
export function decodeLightLevel(raw, metadata = {}) {
  return decodeDecimalChannels(raw, lightLevel.channels, metadata);
}

/** Explicit demonstration input, independent of any attached device. */
export function mockLightLevelLine(monotonicMs) {
  return String(Math.round(127.5 + 127.5 * Math.sin(monotonicMs / 5000)));
}
