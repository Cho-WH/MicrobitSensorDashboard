import { ds18b20 } from './definition.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';

/** Fixed P1,P2 Celsius fields; absent probes are blank, raw precision is preserved. */
export function decodeDs18b20(raw, metadata = {}) {
  return decodeDecimalChannels(raw, ds18b20.channels, metadata);
}

/** Demonstration readings use the probe's 12-bit resolution (1/16 °C). */
export function mockDs18b20Line(monotonicMs) {
  return [24 + 4 * Math.sin(monotonicMs / 20000), 26 + 2 * Math.sin(monotonicMs / 24000)]
    .map(value => Math.round(value * 16) / 16).join(',');
}
