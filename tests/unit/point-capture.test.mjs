import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointCapture } from '../../src/measurement/point-capture.js';
import { createSession } from '../../src/measurement/session.js';
import { openRunStore } from '../../src/data/run-store.js';
import { fixture, reading, locks, memoryRepository, timers, utc } from './storage-support.mjs';
import { getExperiment } from '../../src/catalog/index.js';

function captureFixture(config = {}) {
  let mono = 100, wall = utc + 100;
  const clock = { mono: () => mono, utc: () => wall };
  const capture = createPointCapture({ config: { staleMs: 500, requiredChannelIds: ['temperatureC'], ...config }, clock });
  const connection = { connected: true, confirmed: true, attemptId: 1 };
  return { capture, clock, connection, advance(ms) { mono = ms; wall = utc + ms; }, wall(ms) { wall = ms; } };
}

test('capture freezes click values and UTC time while newer observations arrive; duplicate observation is blocked, equal numbers are allowed', () => {
  const f = captureFixture(), values = { 'manual-condition': 0 }, input = reading(100);
  f.capture.accept(input);
  const request = f.capture.prepare(f.connection, values);
  values['manual-condition'] = 10; input.values.temperatureC = 80;
  assert.throws(() => f.capture.prepare(f.connection), { code: 'capture-pending' });
  request.accept(); assert.throws(() => f.capture.prepare(f.connection), { code: 'capture-duplicate' });
  f.capture.accept(reading(200)); f.advance(200);
  const second = f.capture.prepare(f.connection, { 'manual-condition': null }); second.accept();
  assert.equal(request.sample.values.temperatureC, 25);
  assert.equal(request.sample.receivedAt, utc + 100); assert.equal(request.point.capturedAt, utc + 100);
  assert.equal(request.point.manualValues['manual-condition'], 0);
  assert.equal(second.point.manualValues['manual-condition'], null);
});

test('confirmation, required validity, freshness, parse errors and connection epochs gate capture without cached fallback', () => {
  const f = captureFixture({ confirmationCount: 2, confirmationSpanMs: 100 });
  f.capture.accept(reading(0)); assert.equal(f.capture.status(f.connection).ready, false);
  f.capture.accept(reading(100)); assert.equal(f.capture.status(f.connection).ready, true);
  f.wall(utc - 99999); assert.equal(f.capture.prepare(f.connection).point.capturedAt, utc - 99999);
  // A distinct gate checks timeout independently from a pending reservation.
  const stale = captureFixture(); stale.capture.accept(reading(100)); stale.advance(600);
  assert.equal(stale.capture.status(stale.connection).ready, false);
  stale.advance(99); assert.equal(stale.capture.status(stale.connection).ready, false);
  for (const input of [reading(200, { validity: { temperatureC: 'invalid', pressureHpa: 'valid' } }),
    { type: 'parse-error', receivedAt: utc + 200, monotonicAt: 200, attemptId: 1 }]) {
    const g = captureFixture(); g.capture.accept(reading(100)); g.capture.accept(input); g.advance(200);
    assert.equal(g.capture.status(g.connection).ready, false);
  }
  const g = captureFixture(); g.capture.accept(reading(100));
  assert.equal(g.capture.status({ ...g.connection, attemptId: 2 }).ready, false);
  const reserved = g.capture.prepare(g.connection); g.capture.disconnected();
  assert.throws(() => reserved.validate(g.connection), { code: 'capture-reception' }); reserved.cancel();
  assert.equal(g.capture.status(g.connection).ready, false);
  g.capture.accept(reading(100, { attemptId: 2 }));
  assert.equal(g.capture.status({ ...g.connection, attemptId: 2 }).ready, true);
});

test('first point validates the frozen candidate after async storage preparation, with no orphan Run on rejection', async () => {
  const f = captureFixture(), repository = memoryRepository();
  f.capture.accept(reading(100)); const request = f.capture.prepare(f.connection);
  let release;
  repository.open = () => new Promise(resolve => { release = resolve; });
  const pending = openRunStore({ repository, locks: locks(), timers, id: 'capture-first', context: getExperiment(), create: true,
    recordingMode: 'point', initialPoint: { sample: request.sample, ...request.point },
    beforeCreate: () => request.validate(f.connection) });
  await new Promise(resolve => setImmediate(resolve));
  f.advance(600); release();
  await assert.rejects(pending, { code: 'capture-reception' }); request.cancel();
  assert.equal(await repository.readSnapshot('capture-first'), null);
});

test('manual Session only records explicit captures and retains IDs through failure, withdrawal, finish and additional measurement', async () => {
  const f = captureFixture(); f.capture.accept(reading(100)); const first = f.capture.prepare(f.connection);
  const { store, repository } = await fixture({ recordingMode: 'point', initialPoint: { sample: first.sample, ...first.point } }); first.accept();
  const session = createSession({ store, capture: f.capture, clock: f.clock, config: { staleMs: 500 }, newlyCreated: true }); session.start();
  assert.throws(() => session.capturePoint(f.connection, {}), { code: 'capture-duplicate' });
  session.acceptInput(reading(200)); f.advance(200); assert.equal(store.getState().sampleCount, 1);
  assert.equal(session.capturePoint(f.connection, {}), 2); store.setPointWithdrawn(2, true);
  assert.throws(() => session.capturePoint(f.connection, {}), { code: 'capture-duplicate' });
  const commit = repository.commitBatch; repository.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(store.flush(), /quota/); session.tick(); assert.equal(session.getState().state, 'paused');
  assert.equal(session.captureStatus(f.connection).reason, 'capture-storage');
  assert.equal(session.captureStatus(f.connection).ready, false);
  repository.commitBatch = commit; await store.flush(); session.resume();
  assert.equal(store.getState().sampleCount, 2); assert.equal(session.captureStatus(f.connection).ready, false);
  session.acceptInput(reading(300)); f.advance(300); assert.equal(session.capturePoint(f.connection, {}), 3);
  await session.finish(); assert.equal(session.captureStatus(f.connection).ready, false);
  session.startAdditional({ sameContext: true }); assert.equal(store.getState().sampleCount, 3);
  session.acceptInput(reading(400)); f.advance(400); assert.equal(session.capturePoint(f.connection, {}), 4);
  assert.deepEqual(store.getSamples().map(s => s.receivedAt), [100, 200, 300, 400].map(t => utc + t));
  assert.equal(store.getPointRecords()[1].withdrawn, true); await store.close();
});

test('continuous capture references the sample accepted by this observation, never a paused preview', async () => {
  const f = captureFixture(), { store } = await fixture();
  f.capture.accept(reading(100)); // Ready preview has no accepted source sample yet.
  const session = createSession({ store, capture: f.capture, clock: f.clock }); session.start();
  assert.equal(session.captureStatus(f.connection).ready, false);
  assert.throws(() => session.capturePoint(f.connection, {}), { code: 'capture-reception' });
  assert.equal(store.getState().sampleCount, 0);
  session.acceptInput(reading(100)); session.capturePoint(f.connection, {});
  assert.equal(store.getState().sampleCount, 1);
  assert.equal(store.getPointRecords()[0].capturedSampleId, 1);
  await session.pause(); session.acceptInput(reading(200)); f.advance(200);
  assert.equal(session.captureStatus(f.connection).reason, 'capture-paused');
  assert.throws(() => session.capturePoint(f.connection, {}), { code: 'capture-paused' });
  session.resume(); assert.equal(session.captureStatus(f.connection).ready, false);
  session.acceptInput(reading(300)); f.advance(300);
  session.capturePoint(f.connection, {});
  assert.deepEqual(store.getPointRecords().map(point => point.capturedSampleId), [1, 2]);
  assert.deepEqual(store.getSamples().map(sample => sample.receivedAt), [utc + 100, utc + 300]);
  await store.close();
});
