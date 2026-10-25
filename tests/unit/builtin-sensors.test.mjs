import test from 'node:test';
import assert from 'node:assert/strict';
import { getExperiment, getSensorRuntime } from '../../src/catalog/index.js';
import { getFirmwareArtifact } from '../../src/device/firmware.js';
import { createMockBleClient } from '../../src/device/mock-client.js';
import { createGuideProgress } from '../../src/guide/progress.js';
import { getGuideContent } from '../../src/guide/steps.js';

const sensors = ['temperature', 'light-level', 'accelerometer'];
test('new built-in codecs preserve signs, zero, partial errors and finite range failures in their declared units', () => {
  const temperature = getSensorRuntime(getExperiment('temperature')).decode;
  const light = getSensorRuntime(getExperiment('light-level')).decode;
  const acceleration = getSensorRuntime(getExperiment('accelerometer')).decode;
  assert.equal(temperature('-12').values.temperatureC, -12);
  assert.equal(temperature('0').validity.temperatureC, 'valid');
  assert.equal(light('0').values.lightLevel, 0); assert.equal(light('255').validity.lightLevel, 'valid');
  for (const value of [-1, 256]) { const input = light(String(value)); assert.equal(input.values.lightLevel, value); assert.equal(input.validity.lightLevel, 'out-of-range'); }
  const input = acceleration('0,-2.5,+3e1,1000', { receivedAt: 123, monotonicAt: 4, attemptId: 8 });
  assert.deepEqual(input.values, { accelerationX: 0, accelerationY: -2.5, accelerationZ: 30, accelerationStrength: 1000 });
  assert.equal(input.receivedAt, 123); assert.equal(input.monotonicAt, 4); assert.equal(input.attemptId, 8);
  const partial = acceleration(',0x10,-1000,-1');
  assert.deepEqual(partial.values, { accelerationX: null, accelerationY: null, accelerationZ: -1000, accelerationStrength: -1 });
  assert.deepEqual(partial.validity, { accelerationX: 'missing', accelerationY: 'error', accelerationZ: 'valid', accelerationStrength: 'out-of-range' });
  for (const id of sensors) {
    const { decode, definition } = getSensorRuntime(getExperiment(id));
    const count = definition.channels.length, first = definition.channels[0].id;
    for (const token of ['0x10', 'Infinity', 'NaN', '1e999', '2mg']) {
      const reading = decode([token, ...Array(count - 1).fill('0')].join(','));
      assert.equal(reading.validity[first], 'error'); assert.equal(reading.values[first], null);
    }
    assert.equal(decode(Array(count + 1).fill('0').join(',')).type, 'parse-error');
    assert.equal(decode(null).type, 'parse-error');
    assert.equal(decode(Array(count).fill(' ').join(',')).validity[first], 'missing');
  }
});

test('new built-ins use common preparation, require current reception, and never gain thermal activity or magnetic calibration', () => {
  for (const id of sensors) {
    const context = getExperiment(id), guide = createGuideProgress(context), content = getGuideContent(context);
    assert.deepEqual(guide.getState().steps.map(step => step.id), ['equipment', 'program', 'connection', 'reception']);
    assert.deepEqual(content.wiring, []); assert.equal(content.viewer, null); assert.deepEqual(content.calibrationInstructions, []);
    assert.throws(() => getExperiment(id, 'gay-lussac'));
    guide.confirm('equipment'); guide.confirm('program'); assert.equal(guide.getState().ready, false);
    guide.setAttempt(1); guide.observe({ attemptId: 1, connected: true, receptionReady: true, mock: true });
    assert.equal(guide.getState().ready, true); assert.equal(guide.getState().setup.simulated, true);
    guide.setAttempt(2); assert.equal(guide.getState().ready, false);
    const firmware = getFirmwareArtifact(context.firmware.id);
    assert.equal(firmware.codecId, context.sensor.codecId); assert.equal(firmware.sampleIntervalMs, context.firmware.sampleIntervalMs);
    assert.deepEqual(context.connectionPolicy.requiredChannelIds, context.channels.map(c => c.id));
  }
  assert.equal(getExperiment('temperature').channels[0].unit, '℃');
  assert.equal(getExperiment('temperature').channels[0].unit, getExperiment('bmp280').channels[0].unit);
  assert.equal(getExperiment('light-level').channels[0].unit, '상대값');
  const context = getExperiment('accelerometer');
  assert.ok(context.channels.every(channel => channel.unit === 'mg'));
  assert.deepEqual(context.sensor.defaultVisibleChannelIds, ['accelerationStrength']);
  assert.equal(context.channels.length, 4);
});

test('simulated BLE honors trusted sampling intervals, repeated starts and disconnect cleanup', async () => {
  for (const id of sensors) {
    const context = getExperiment(id); context.firmware.sampleIntervalMs = 1; // Imported copy cannot alter timing.
    const jobs = new Map(), readings = []; let sequence = 0;
    const timers = { setInterval(fn, ms) { const key = ++sequence; jobs.set(key, { fn, ms }); return key; }, clearInterval(key) { jobs.delete(key); } };
    const client = createMockBleClient(() => context, { timers, now: () => 0 });
    await client.startNotifications(line => readings.push(line));
    await client.sendStartCommand(); await client.sendStartCommand(); assert.equal(jobs.size, 1);
    const job = [...jobs.values()][0]; assert.equal(job.ms, id === 'temperature' ? 1000 : 100);
    job.fn();
    const reading = getSensorRuntime(context).decode(readings[0]);
    assert.ok(Object.values(reading.validity).every(value => value === 'valid'));
    if (id === 'accelerometer') assert.equal(reading.values.accelerationStrength, 1000);
    await client.disconnect(); job.fn(); assert.equal(jobs.size, 0); assert.equal(readings.length, 1);
  }
});
