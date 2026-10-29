import test from 'node:test';
import assert from 'node:assert/strict';
import { getExperiment, getSensorRuntime } from '../../src/catalog/index.js';
import { decodeBmp280 } from '../../src/catalog/sensors/bmp280/codec.js';
import { decodeMagnetometer } from '../../src/catalog/sensors/magnetometer/codec.js';
import { decodeDs18b20 } from '../../src/catalog/sensors/ds18b20/codec.js';

test('DS18B20 preserves 12-bit Celsius readings and distinguishes corrupt, missing and out-of-range data', () => {
  const context = getExperiment('ds18b20'), runtime = getSensorRuntime(context);
  assert.equal(context.channels[0].unit, '℃');
  assert.equal(context.firmware.sampleIntervalMs, 1000);
  assert.equal(context.firmware.codecId, 'ds18b20-csv-v1');
  for (const value of [-55, -10.0625, 0, 23.9375, 85, 125]) {
    const reading = runtime.decode(`${value},${value}`, { receivedAt: 123, monotonicAt: 5, attemptId: 9 });
    assert.deepEqual(reading.values, { temperature1C: value, temperature2C: value });
    assert.deepEqual(reading.validity, { temperature1C: 'valid', temperature2C: 'valid' });
    assert.equal(reading.receivedAt, 123); assert.equal(reading.attemptId, 9);
  }
  for (const value of [-55.0625, 125.0625]) {
    const reading = decodeDs18b20(`${value},0`);
    assert.equal(reading.values.temperature1C, value);
    assert.equal(reading.validity.temperature1C, 'out-of-range');
    assert.equal(reading.validity.temperature2C, 'valid');
  }
  assert.deepEqual(decodeDs18b20(' ,0').values, { temperature1C: null, temperature2C: 0 });
  assert.deepEqual(decodeDs18b20(' ,0').validity, { temperature1C: 'missing', temperature2C: 'valid' });
  assert.deepEqual(decodeDs18b20('1, ').validity, { temperature1C: 'valid', temperature2C: 'missing' });
  for (const token of ['NaN', 'Infinity', '0x10', '23°C']) {
    const reading = decodeDs18b20(`${token},23.9375`);
    assert.equal(reading.values.temperature1C, null);
    assert.equal(reading.validity.temperature1C, 'error');
    assert.equal(reading.values.temperature2C, 23.9375);
  }
  assert.equal(decodeDs18b20('23').type, 'parse-error');
  assert.equal(decodeDs18b20('23,24,25').type, 'parse-error');
  assert.throws(() => getExperiment('ds18b20', 'gay-lussac'));
});

test('magnetometer preserves all four ordered channels, zero, signs and scientific notation', () => {
  const input = decodeMagnetometer('0, -2.5, +3e1, 30.1', { receivedAt: 123, monotonicAt: 10, attemptId: 7 });
  assert.deepEqual(input.values, { magneticX: 0, magneticY: -2.5, magneticZ: 30, magneticStrength: 30.1 });
  assert.equal(input.receivedAt, 123); assert.equal(input.attemptId, 7);
  assert.ok(Object.values(input.validity).every(v => v === 'valid'));
  const partial = decodeMagnetometer(',1,0x10,-4');
  assert.deepEqual(partial.values, { magneticX: null, magneticY: 1, magneticZ: null, magneticStrength: -4 });
  assert.deepEqual(partial.validity, { magneticX: 'missing', magneticY: 'valid', magneticZ: 'error', magneticStrength: 'out-of-range' });
});

test('decimal codecs never coerce blank, hexadecimal, nonfinite or text tokens into a valid measurement', () => {
  for (const token of ['0x10', 'Infinity', 'NaN', '1e999', '25C']) {
    const bmp = decodeBmp280(`${token},0,1000`), magnet = decodeMagnetometer(`${token},0,0,1`);
    assert.equal(bmp.validity.temperatureC, 'error'); assert.equal(bmp.values.temperatureC, null);
    assert.equal(magnet.validity.magneticX, 'error'); assert.equal(magnet.values.magneticX, null);
  }
  assert.equal(decodeMagnetometer('1,2,3').type, 'parse-error');
  assert.equal(decodeMagnetometer('1,2,3,4,5').type, 'parse-error');
  assert.equal(decodeMagnetometer(' ,0,0,0').validity.magneticX, 'missing');
});

test('magnetometer is a distinct registered free measurement and cannot run a thermal-only activity', () => {
  const context = getExperiment('magnetometer');
  assert.equal(context.firmware.startCommand, 'prepare'); assert.equal(context.defaultGraph.yColumnId, 'magneticStrength');
  assert.ok(context.channels.every(c => c.unit === 'µT'));
  assert.equal(context.activity, null); assert.deepEqual(context.analysisTemplates, []);
  assert.throws(() => getExperiment('magnetometer', 'gay-lussac'));
  context.firmware.version = 999; assert.throws(() => getSensorRuntime(context), { code: 'unsupported-sensor-runtime' });
  const activity = getExperiment('bmp280', 'gay-lussac'); activity.activity.version = 999;
  assert.throws(() => getSensorRuntime(activity), { code: 'unsupported-sensor-runtime' });
  const changedChannels = getExperiment(); changedChannels.channels[0].id = 'another-channel';
  assert.throws(() => getSensorRuntime(changedChannels), { code: 'unsupported-sensor-runtime' });
});

test('magnetic status lines are distinct from numeric readings and require the v2 protocol',()=>{
  for(const status of ['choice','calibrating','calibrated','skipped']) assert.deepEqual(decodeMagnetometer('@mag,2,'+status).status,status);
  for(const line of ['@mag,1,choice','@mag,2,error','@mag,2,calibrated,1']) assert.equal(decodeMagnetometer(line).type,'parse-error');
});
