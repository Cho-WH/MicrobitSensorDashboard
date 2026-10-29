import bmp280 from './sensors/bmp280/index.js';
import ds18b20 from './sensors/ds18b20/index.js';
import magnetometer from './sensors/magnetometer/index.js';
import temperature from './sensors/temperature/index.js';
import lightLevel from './sensors/light-level/index.js';
import accelerometer, { legacyAccelerometer } from './sensors/accelerometer/index.js';
import gayLussac from './activities/gay-lussac/index.js';
import { createRegistry } from './registry.js';

// The single registration point. UI, routes, codecs, guides and policies resolve here.
export const registry = createRegistry({ sensors: [magnetometer, legacyAccelerometer, accelerometer, temperature, lightLevel, bmp280, ds18b20], activities: [gayLussac] });
