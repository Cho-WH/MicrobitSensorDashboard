import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { getExperiment, getSensorRuntime, getActivityPolicy } from '../../src/catalog/index.js';
import { decodeMotionMagnetic } from '../../src/catalog/sensors/motion-magnetic/codec.js';
import { createSession } from '../../src/measurement/session.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';
import { buildCsv, parseExperimentCsv } from '../../src/data/files/csv.js';
import { fixture, utc } from './storage-support.mjs';

// Prevent mixed-unit corruption and accidental re-computation of the board's Strength.
test('five fields retain both measured strengths and scale acceleration only', () => {
  const at = { receivedAt: utc, monotonicAt: 4, attemptId: 3 };
  const input = decodeMotionMagnetic('0,-1000,500,1234,67.8', at);
  assert.deepEqual(input.values, { accelerationX: 0, accelerationY: -9.80665,
    accelerationZ: 4.903325, accelerationStrength: 1234 * .00980665, magneticStrength: 67.8 });
  assert.equal(input.receivedAt, utc);
  assert.equal(input.attemptId, 3);
  assert.ok(Object.values(input.validity).every(value => value === 'valid'));
  const partial = decodeMotionMagnetic(',-2,NaN,-1,-3');
  assert.equal(partial.values.accelerationX, null);
  assert.equal(partial.validity.accelerationX, 'missing');
  assert.equal(partial.validity.accelerationZ, 'error');
  assert.equal(partial.validity.accelerationStrength, 'out-of-range');
  assert.equal(partial.validity.magneticStrength, 'out-of-range');
  for (const frame of ['1,2,3,4', '1,2,3,4,5,6']) assert.equal(decodeMotionMagnetic(frame).type, 'parse-error');
  assert.equal(decodeMotionMagnetic('@mag,2,skipped', at).type, 'device-status');
  assert.equal(decodeMotionMagnetic('@mag,2,unknown', at).type, 'parse-error');
});

test('common recording and exports preserve five channels, shared time and pause boundaries', async () => {
  const context = getExperiment('motion-magnetic', 'centripetal');
  const { store } = await fixture({ context });
  try {
    const session = createSession({ store }), runtime = getSensorRuntime(context);
    const reading = ms => runtime.decode('250,0,-1000,1031,45.25', { receivedAt: utc + ms, monotonicAt: ms, attemptId: 1 });
    session.acceptInput(reading(0)); assert.equal(store.getSamples().length, 0);
    session.start(); session.acceptInput(reading(100));
    await session.pause(); session.acceptInput(reading(200));
    session.resume(); session.acceptInput(reading(300)); await session.finish();
    assert.deepEqual(store.getSamples().map(s => s.receivedAt), [utc + 100, utc + 300]);
    const workspace = createWorkspace({ store });
    const graph = workspace.getGraphData();
    assert.equal(graph.yUnit, 'm/s²'); assert.equal(graph.right.yUnit, 'µT');
    assert.deepEqual(graph.points.map(p => p.sampleId), graph.right.points.map(p => p.sampleId));
    const original = store.getSnapshot(), restored = parseExperimentJson(buildExperimentJson(original));
    assert.deepEqual(restored.samples, original.samples);
    assert.deepEqual(restored.run.context.channels, original.run.context.channels);
    const vendor = { module: { exports: {} }, exports: {} };
    runInNewContext(await readFile(new URL('../../public/vendor/papaparse-5.7.0.min.js', import.meta.url), 'utf8'), vendor);
    globalThis.Papa = vendor.module.exports;
    const csv = parseExperimentCsv(buildCsv(original), { id: 'five-channel-csv', now: utc });
    assert.deepEqual(csv.samples.map(s => s.values), original.samples.map(s => s.values));
    assert.deepEqual(csv.samples.map(s => s.receivedAt), original.samples.map(s => s.receivedAt));
  } finally { await store.close(); }
});

test('centripetal additional measurement checks its own physical conditions', () => {
  const context = getExperiment('motion-magnetic', 'centripetal'), policy = getActivityPolicy(context);
  assert.throws(() => getExperiment('accelerometer', 'centripetal'));
  const conditions = { radius: 'same', magnet: 'same', level: 'same' };
  assert.deepEqual(policy.validateAdditional({ sameContext: true, conditions, note: '' }).conditions, conditions);
  assert.throws(() => policy.validateAdditional({ sameContext: true, conditions: { ...conditions, radius: 'changed' }, note: '' }));
  const checked = policy.validateAdditional({ sameContext: true, conditions: { ...conditions, radius: 'changed' }, note: '반지름을 다시 측정함' });
  assert.equal(checked.conditions.radius, 'changed');
  const thermal = getActivityPolicy(getExperiment('bmp280', 'gay-lussac'));
  assert.throws(() => thermal.validateAdditional({ sameContext: true, conditions, note: '' }));
});
