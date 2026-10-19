import test from 'node:test';
import assert from 'node:assert/strict';
import { getExperiment, getSensorRuntime } from '../../src/catalog/index.js';
import { decodeBmp280 } from '../../src/catalog/sensors/bmp280/codec.js';
import { decodeMagnetometer } from '../../src/catalog/sensors/magnetometer/codec.js';

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
  assert.equal(context.firmware.startCommand, 'start'); assert.equal(context.defaultGraph.yColumnId, 'magneticStrength');
  assert.ok(context.channels.every(c => c.unit === 'µT'));
  assert.equal(context.activity, null); assert.deepEqual(context.analysisTemplates, []);
  assert.throws(() => getExperiment('magnetometer', 'gay-lussac'));
  context.firmware.version = 2; assert.throws(() => getSensorRuntime(context), { code: 'unsupported-sensor-runtime' });
  const activity = getExperiment('bmp280', 'gay-lussac'); activity.activity.version = 999;
  assert.throws(() => getSensorRuntime(activity), { code: 'unsupported-sensor-runtime' });
  const changedChannels = getExperiment(); changedChannels.channels[0].id = 'another-channel';
  assert.throws(() => getSensorRuntime(changedChannels), { code: 'unsupported-sensor-runtime' });
});
