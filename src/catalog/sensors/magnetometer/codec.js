import { magnetometer } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';
// Shared by sensors using the same compass preparation protocol.
export function decodeMagneticStatus(raw, { receivedAt = Date.now(), monotonicAt = 0, attemptId = 0 } = {}) {
  const base = { receivedAt, monotonicAt, attemptId };
  const status = typeof raw === 'string' && /^@mag,2,(choice|calibrating|calibrated|skipped)$/.exec(raw.trim());
  if (status) return { type: 'device-status', status: status[1], ...base };
  if (typeof raw === 'string' && raw.trim().startsWith('@')) return { type: 'parse-error', reasonCode: 'unknown-device-status', ...base };
  return null;
}
export function decodeMagnetometer(raw, metadata = {}) {
  return decodeMagneticStatus(raw, metadata) ?? decodeDecimalChannels(raw, magnetometer.channels, metadata);
}

/** Explicit demonstration input generated independently of any attached device. */
export function mockMagnetometerLine(monotonicMs) {
  const t = monotonicMs / 1000, x = 20 * Math.sin(t / 3), y = 15 * Math.cos(t / 4), z = 35 + 3 * Math.sin(t / 5);
  return `${x},${y},${z},${Math.hypot(x, y, z)}`;
}
