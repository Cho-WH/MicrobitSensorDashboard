// Core revision, exact retry, snapshot and lock regressions adapted from G/tests/recording.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openRunStore, importRunSnapshot, openTemporaryRunStore } from '../../src/data/run-store.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';
import { LIMITS } from '../../src/domain/limits.js';
import { fixture, memoryRepository, locks, sample, timers, utc } from './storage-support.mjs';

test('creation verifies durable storage before handing out a writer and releases its lock on failure', async () => {
  const repository = memoryRepository(), manager = locks(), commit = repository.commitBatch;
  repository.commitBatch = async () => { throw new Error('unavailable'); };
  await assert.rejects(fixture({ repository, locks: manager }), /unavailable/);
  repository.commitBatch = commit;
  const { store } = await fixture({ repository, locks: manager });
  assert.equal(store.getState().status, 'clean');
  assert.ok(await repository.readSnapshot('test'));
  await store.close();
});

test('in-flight save acknowledges captured revisions only; immutable incremental reads do not expose data', async () => {
  const { repository, store } = await fixture(), commit = repository.commitBatch;
  store.appendSample(sample(1)); createWorkspace({ store });
  store.saveWorkspace({ ...store.getSnapshot().workspace, workspaceRevision: 2, note: 'first' });
  let release;
  repository.commitBatch = batch => new Promise(resolve => { release = () => commit(batch).then(resolve); });
  const flushing = store.flush();
  store.appendSample(sample(2)); store.saveWorkspace({ ...store.getSnapshot().workspace, workspaceRevision: 3, note: 'second' });
  const snapshot = store.getSnapshot();
  await release(); await flushing;
  assert.equal(store.getState().savedSampleId, 1);
  assert.equal(store.getState().status, 'pending');
  assert.equal(store.getState().pendingSamples, 1);
  const latest = store.getLatestSample(), range = store.readSamples({ afterId: 1, throughId: 2 });
  latest.values.temperatureC = 99; range[0].values.temperatureC = 100;
  assert.equal(store.getLatestSample().values.temperatureC, 25);
  store.appendSample(sample(3));
  assert.equal(snapshot.samples.length, 2);
  assert.equal(snapshot.workspace.note, 'second');
  repository.commitBatch = commit; await store.close();
  assert.equal((await repository.readSnapshot('test')).workspace.workspaceRevision, 3);
});

for (const committed of [false, true]) test(`failed writes retry identical batches before newer samples and notes (committed=${committed})`, async () => {
  const { repository, store } = await fixture(), commit = repository.commitBatch, attempts = [];
  store.appendSample(sample(1));
  const eventId = store.appendEvent({ type: 'note', receivedAt: utc, payload: { note: 'first' }, source: 'user' });
  let rejectSave;
  repository.commitBatch = batch => {
    attempts.push(structuredClone(batch));
    return new Promise((_resolve, reject) => { rejectSave = async () => {
      if (committed) await commit(batch);
      reject(new Error('save failed'));
    }; });
  };
  const pending = store.flush();
  store.appendSample(sample(2)); store.updateEventNote(eventId, 'latest');
  await rejectSave(); await assert.rejects(pending, /save failed/);
  assert.equal(store.getState().status, 'error');
  assert.equal(store.getSnapshot().samples.length, 2);
  repository.commitBatch = async batch => { attempts.push(structuredClone(batch)); return commit(batch); };
  await store.flush();
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(attempts[2].samples[0].sampleId, 2);
  assert.equal((await repository.readSnapshot('test')).events[0].payload.note, 'latest');
  assert.equal(store.getState().pendingEvents, 0);
  await store.close();
});

test('a second writer and an unsupported lock environment remain read-only', async () => {
  const { repository, store, lockManager } = await fixture();
  store.appendSample(sample(1)); await store.flush();
  for (const manager of [lockManager, null]) {
    const reader = await openRunStore({ repository, id: 'test', locks: manager, timers });
    assert.equal(reader.getState().writable, false);
    assert.throws(() => reader.appendSample(sample(2)), /읽기 전용/);
    assert.equal(reader.getState().sampleCount, 1); await reader.close();
  }
  await assert.rejects(openRunStore({ repository, id: 'new', create: true, locks: null }), /기록할 수 없어요/);
  await store.close();
  const reopened = await openRunStore({ repository, id: 'test', locks: lockManager, timers });
  assert.equal(reopened.getState().writable, true); await reopened.close();
});

test('deletion retains the writer lock through failure and blocks dirty deletion', async () => {
  const { repository, store, lockManager } = await fixture();
  store.appendSample(sample(1));
  await assert.rejects(store.remove(), /저장/);
  await store.flush();
  let rejectDelete;
  repository.deleteRun = () => new Promise((_resolve, reject) => { rejectDelete = reject; });
  const deletion = store.remove();
  assert.throws(() => store.updateRun({ name: 'during deletion' }), /읽기 전용/);
  const reader = await openRunStore({ repository, id: 'test', locks: lockManager, timers });
  assert.equal(reader.getState().writable, false);
  rejectDelete(new Error('delete failed')); await assert.rejects(deletion, /delete failed/);
  assert.equal(store.getState().writable, true);
  store.updateRun({ name: 'recovered' }); await store.flush();
  assert.equal((await repository.readSnapshot('test')).run.name, 'recovered');
  reader.dispose(); await store.close();
});

test('admission failure leaves samples, workspace and revision intact and export stays within its budget', async () => {
  const { store } = await fixture(); store.appendSample(sample(1)); createWorkspace({ store });
  const before = store.getSnapshot();
  assert.throws(() => store.appendSample(sample(3)), /순서/);
  assert.throws(() => store.appendSample(sample(2, { values: { temperatureC: NaN, pressureHpa: 1000 } })), { code: 'invalid-record' });
  assert.throws(() => store.saveWorkspace({ ...before.workspace, workspaceRevision: 2, note: 'x'.repeat(LIMITS.fileBytes) }), /용량/);
  assert.deepEqual(store.getSnapshot(), before);
  const json = buildExperimentJson(before);
  assert.equal(new TextEncoder().encode(json).length, store.getState().serializedBytes);
  await store.close();
});

test('event note edits cannot change source data, automatic events or their timestamps', async () => {
  const { store } = await fixture(); store.appendSample(sample(1));
  const eventId = store.appendEvent({ type: 'note', receivedAt: utc, payload: {}, source: 'user' });
  const systemId = store.appendEvent({ type: 'discontinuity', receivedAt: utc, payload: {}, source: 'system' });
  const before = store.getSnapshot();
  assert.throws(() => store.updateEventNote(systemId, 'bad'), /사용자/);
  assert.throws(() => store.updateEventNote(100, 'bad'), /사용자/);
  store.updateEventNote(eventId, '  note\nnext line  ');
  assert.equal(store.getEvents()[0].payload.note, 'note\nnext line');
  assert.equal(store.getEvents()[0].receivedAt, utc);
  assert.deepEqual(store.getSamples(), before.samples);
  await store.close();
});

test('imports create a separately locked run atomically and leave the original intact on failure', async () => {
  const { repository, store, lockManager } = await fixture();
  store.appendSample(sample(1)); await store.flush();
  const before = store.getSnapshot();
  const imported = await importRunSnapshot({ repository, snapshot: before, id: 'imported', locks: lockManager, timers, now: () => utc + 1 });
  assert.equal(imported.getState().status, 'clean');
  assert.equal(imported.getRun().source, 'import');
  assert.equal(imported.getSamples()[0].runId, 'imported');
  assert.deepEqual(await repository.readSnapshot('test'), before);
  const commit = repository.commitBatch;
  repository.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(importRunSnapshot({ repository, snapshot: before, id: 'failed', locks: lockManager }), /quota/);
  assert.equal(await repository.readSnapshot('failed'), null);
  assert.deepEqual(await repository.readSnapshot('test'), before);
  repository.commitBatch = commit;
  await imported.close(); await store.close();
});

test('an exported completed run near the file limit can be imported without fresh-recording headroom', async () => {
  const { repository, store, lockManager } = await fixture();
  const padding = 'x'.repeat(LIMITS.fileBytes - store.getState().serializedBytes - 1024);
  store.appendEvent({ receivedAt: utc, type: 'measurement-end', source: 'system', payload: { note: padding } });
  store.updateRun({ status: 'complete' });
  const snapshot = store.getSnapshot();
  assert.ok(store.getState().serializedBytes > LIMITS.fileBytes - 8192);
  assert.ok(new TextEncoder().encode(buildExperimentJson(snapshot)).length <= LIMITS.fileBytes);
  const imported = await importRunSnapshot({ repository, snapshot, id: 'copy', locks: lockManager, timers });
  assert.equal(imported.getState().runStatus, 'complete');
  assert.equal(imported.getEvents()[0].payload.note.length, padding.length);
  await imported.close(); await store.close();
});

test('invalid workspace references and formulas cannot enter storage or change its revision', async () => {
  const { store } = await fixture(); store.appendSample(sample(1)); createWorkspace({ store });
  const before = store.getSnapshot(), next = { ...before.workspace, workspaceRevision: 2 };
  for (const invalid of [
    { ...next, selectedIds: [99] },
    { ...next, tableLastSampleId: 2 },
    { ...next, graph: { xColumnId: 'temperatureC', yColumnId: 'unknown', type: 'scatter' } },
    { ...next, calculatedColumns: [{ id: 'calc-loop', name: 'cycle', unit: null,
      lhs: { kind: 'column', columnId: 'calc-loop' }, op: '+', rhs: { kind: 'constant', value: 1 } }] },
  ]) {
    assert.throws(() => store.saveWorkspace(invalid));
    assert.deepEqual(store.getSnapshot(), before);
  }
  await store.close();
});

test('temporary file analysis edits and exports without touching locks or durable storage', async () => {
  const { store } = await fixture(); store.appendSample(sample(1, { receivedAt: null }));
  const snapshot = store.getSnapshot(), original = structuredClone(snapshot);
  const temporary = await openTemporaryRunStore({ snapshot, timers, locks: { request() { assert.fail('must not request a lock'); } } });
  assert.equal(temporary.getState().temporary, true);
  assert.equal(temporary.getState().writable, true);
  assert.throws(() => temporary.appendSample(sample(2)), { code: 'imported-source' });
  const work = createWorkspace({ store: temporary }); work.exclude([1], '확인');
  await temporary.flush();
  const json = JSON.parse(buildExperimentJson(temporary.getSnapshot()));
  assert.equal(json.samples[0].receivedAt, null);
  assert.equal(json.workspace.exclusions[0].reason, '확인');
  assert.deepEqual(snapshot, original);
  await temporary.close(); await store.close();
});

test('source value and validity admission matches JSON restoration without changing rejected samples', async () => {
  const { store } = await fixture(), before = store.getSnapshot();
  for (const [value, status] of [[25, 'missing'], [null, 'out-of-range'], [25, 'unsupported'], [null, 'valid']]) {
    assert.throws(() => store.appendSample(sample(1, {
      values: { temperatureC: value, pressureHpa: 1000 }, validity: { temperatureC: status, pressureHpa: 'valid' },
    })), /유효성/);
    assert.deepEqual(store.getSnapshot(), before);
  }
  const accepted = [[25, 'valid'], [-100, 'out-of-range'], [null, 'missing'], [null, 'unsupported'], [25, 'error'], [null, 'error']];
  for (const [index, [value, status]] of accepted.entries()) store.appendSample(sample(index + 1, {
    values: { temperatureC: value, pressureHpa: 1000 }, validity: { temperatureC: status, pressureHpa: 'valid' },
  }));
  const restored = parseExperimentJson(buildExperimentJson(store.getSnapshot()));
  assert.deepEqual(restored.samples.map(s => [s.values.temperatureC, s.validity.temperatureC]), accepted);
  await store.close();
});
