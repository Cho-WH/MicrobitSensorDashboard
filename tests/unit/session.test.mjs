import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, restoreSession } from '../../src/measurement/session.js';
import { openRunStore } from '../../src/data/run-store.js';
import { fixture, reading, timers, utc } from './storage-support.mjs';

test('preview, repeated start, pause/resume and repeated finish preserve exactly the accepted source values', async () => {
  const { store } = await fixture(), session = createSession({ store });
  session.acceptInput(reading(0)); assert.equal(store.getState().sampleCount, 0);
  assert.equal(store.getEvents().length, 0);
  assert.equal(session.start(), true); assert.equal(session.start(), false);
  session.acceptInput(reading(100)); await session.pause();
  session.acceptInput(reading(200)); assert.equal(store.getState().sampleCount, 1);
  assert.equal(session.resume(), true); session.acceptInput(reading(300));
  await Promise.all([session.finish(), session.finish()]); session.acceptInput(reading(400));
  assert.deepEqual(store.getSamples().map(s => s.receivedAt), [utc + 100, utc + 300]);
  assert.equal(store.getEvents(100).filter(e => e.type === 'measurement-end').length, 1);
  assert.equal(session.getState().state, 'ended');
  await store.close();
});

test('finishing closes the gate before a delayed or failed save and does not duplicate its event on retry', async () => {
  const { store, repository } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0));
  const commit = repository.commitBatch;
  repository.commitBatch = async () => { throw new Error('quota'); };
  const finish = session.finish(); session.acceptInput(reading(100));
  await assert.rejects(finish, /quota/);
  assert.equal(session.getState().state, 'finishing');
  session.acceptInput(reading(200));
  assert.equal(store.getState().sampleCount, 1);
  assert.equal(store.getState().status, 'error');
  repository.commitBatch = commit; await session.finish();
  assert.equal(store.getEvents(100).filter(e => e.type === 'measurement-end').length, 1);
  await store.close();
});

test('retry completes a partially admitted finish without losing the closed input gate or duplicating its event', async () => {
  const { store } = await fixture(); let failOnce = true;
  const session = createSession({ store: { ...store, updateRun(patch) {
    if (patch.status === 'complete' && failOnce) { failOnce = false; throw new Error('admission failed'); }
    return store.updateRun(patch);
  } } });
  session.start(); session.acceptInput(reading(0));
  await assert.rejects(session.finish(), /admission failed/);
  session.acceptInput(reading(100));
  assert.equal(store.getState().sampleCount, 1);
  assert.equal(session.getState().state, 'finishing');
  await session.finish();
  assert.equal(store.getRun().status, 'complete');
  assert.equal(store.getEvents(100).filter(e => e.type === 'measurement-end').length, 1);
  await store.close();
});

test('storage failure pauses subsequent input without clearing already collected data', async () => {
  const { store, repository } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0));
  const commit = repository.commitBatch;
  repository.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(store.flush(), /quota/);
  session.acceptInput(reading(100));
  assert.equal(session.getState().state, 'paused');
  assert.equal(store.getState().sampleCount, 1);
  assert.throws(() => session.resume(), /저장 오류/);
  repository.commitBatch = commit; await store.flush(); session.resume(); session.acceptInput(reading(200));
  assert.equal(store.getState().sampleCount, 2); await store.close();
});

test('restoration marks unfinished recording interrupted once and never auto-records', async () => {
  const { store, repository, lockManager } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0)); await store.close();
  for (let i = 0; i < 2; i++) {
    const reopened = await openRunStore({ repository, id: 'test', locks: lockManager, timers });
    assert.equal(restoreSession({ store: reopened, now: () => utc + 1000 }), null);
    assert.equal(reopened.getRun().status, 'interrupted');
    assert.equal(reopened.getEvents().filter(e => e.type === 'interrupted').length, 1);
    const paused = createSession({ store: reopened }); paused.acceptInput(reading(2000));
    assert.equal(reopened.getState().sampleCount, 1); await reopened.close();
  }
});

test('free measurement has no activity rules; injected policy alone owns activity progress', async () => {
  const { store } = await fixture(), session = createSession({ store });
  session.start();
  assert.equal(session.markEvent('heating-start'), false);
  assert.equal(session.markEvent('note', { note: '자유 측정' }), true);
  const commands = [], activity = createSession({ store, activityPolicy: { initialState: { count: 0 },
    reduceActivity(state, command, facts) { commands.push({ command, facts }); return {
      nextState: { count: state.count + 1 }, events: [{ type: command.type, payload: command.payload }] }; },
  } });
  activity.start(); assert.equal(activity.markEvent('custom-activity', { value: 1 }), true);
  assert.equal(activity.getState().activity.count, 1);
  assert.equal(commands[0].facts.recording, true);
  await store.close();
});

test('additional measurement requires saved data and explicit same-configuration confirmation', async () => {
  const { store } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0)); await session.finish();
  assert.throws(() => session.startAdditional({}), /센서/);
  session.startAdditional({ sameContext: true }); session.acceptInput(reading(100));
  assert.deepEqual(store.getSamples().map(s => s.sampleId), [1, 2]);
  assert.equal(store.getEvents(100).find(e => e.type === 'additional-measurement').payload.previousLastSampleId, 1);
  await store.close();
});

test('one invalid channel preserves the valid channel and finite out-of-range source number', async () => {
  const { store } = await fixture(), session = createSession({ store }); session.start();
  session.acceptInput(reading(0, { values: { temperatureC: -100, pressureHpa: 1000 },
    validity: { temperatureC: 'out-of-range', pressureHpa: 'valid' } }));
  session.acceptInput({ type: 'parse-error', reasonCode: 'fields', receivedAt: utc + 1, monotonicAt: 1, attemptId: 1 });
  assert.equal(store.getLatestSample().values.temperatureC, -100);
  assert.equal(store.getLatestSample().values.pressureHpa, 1000);
  assert.equal(store.getState().sampleCount, 1);
  assert.ok(store.getEvents(100).some(e => e.type === 'parse-error'));
  await store.close();
});
