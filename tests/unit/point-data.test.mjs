import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, locks, memoryRepository, sample, timers, utc } from './storage-support.mjs';
import { openRunStore } from '../../src/data/run-store.js';
import { getExperiment } from '../../src/catalog/index.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { captureEvidence, evidenceGraph } from '../../src/analysis/reflection.js';
import { pointSourceRows } from '../../src/analysis/data-source.js';
import { createCalculator } from '../../src/analysis/calculations.js';
import { buildExperimentJson, parseExperimentJson, prepareImportedSnapshot } from '../../src/data/files/json.js';
import { validateExperimentSnapshot } from '../../src/data/files/validation.js';
import { readCell } from '../../src/domain/columns.js';
import { LIMITS } from '../../src/domain/limits.js';

const condition = { id: 'manual-condition', name: '거리', unit: 'cm', type: 'number' };
const point = (capturedSampleId, value = null) => ({ capturedSampleId, capturedAt: utc + 5000,
  manualValues: { 'manual-condition': value } });
const initialPoint = { sample: sample(1), capturedAt: utc + 5000, manualValues: { 'manual-condition': 0 } };
const pointOptions = extra => ({ recordingMode: 'point', manualColumns: [condition], initialPoint, ...extra });

test('first point creates the run and source together; invalid input and failed writes leave no partial run', async () => {
  const repository = memoryRepository(), lockManager = locks();
  for (const value of [Infinity, '5', undefined]) {
    await assert.rejects(fixture(pointOptions({ repository, locks: lockManager,
      initialPoint: { ...initialPoint, manualValues: { 'manual-condition': value } } })));
    assert.equal(await repository.readSnapshot('test'), null);
  }
  await assert.rejects(fixture(pointOptions({ repository: { ...repository, commitBatch: async () => { throw new Error('quota'); } }, locks: lockManager })), /quota/);
  assert.equal(await repository.readSnapshot('test'), null);
  const { store } = await fixture(pointOptions({ repository, locks: lockManager }));
  const saved = await repository.readSnapshot('test');
  assert.equal(saved.samples.length, 1); assert.equal(saved.pointRecords.length, 1);
  assert.equal(saved.pointRecords[0].manualValues['manual-condition'], 0);
  assert.equal(store.getState().status, 'clean');
  assert.throws(() => store.appendSample(sample(2)), /함께/);
  store.dispose();
});

test('a lost first-point acknowledgement is recovered without a second run or point', async () => {
  const repository = memoryRepository(), commit = repository.commitBatch;
  repository.commitBatch = async batch => { await commit(batch); throw new Error('ack lost'); };
  const { store } = await fixture(pointOptions({ repository }));
  assert.equal(store.getState().status, 'clean');
  assert.equal((await repository.readSnapshot('test')).pointRecords.length, 1);
  store.dispose();
});

test('manual source and point admission is atomic at validation and file-budget failures', async () => {
  const { store } = await fixture(pointOptions());
  const before = store.getSnapshot();
  assert.throws(() => store.appendPointRecord(point(2, NaN), sample(2)));
  assert.throws(() => store.appendPointRecord(point(2, 5), sample(2, { rawExtra: 'x'.repeat(LIMITS.fileBytes) })), /용량/);
  assert.deepEqual(store.getSnapshot(), before);
  store.appendPointRecord(point(2, -1.25), sample(2));
  assert.equal(store.getState().pointCount, 2);
  const restored = parseExperimentJson(buildExperimentJson(store.getSnapshot()));
  assert.equal(restored.samples.length, 2); assert.equal(restored.pointRecords[1].manualValues['manual-condition'], -1.25);
  store.dispose();
});

test('continuous point references are unique, conditions stay separate, and withdrawal never renumbers source data', async () => {
  const { store, repository, lockManager } = await fixture();
  for (let id = 1; id <= 5; id++) store.appendSample(sample(id));
  store.appendPointRecord({ capturedSampleId: 2, capturedAt: utc });
  store.setManualColumn(condition);
  store.appendPointRecord(point(5, 0));
  const raw = store.getSamples();
  assert.equal(store.getPointRecords()[0].manualValues['manual-condition'], null);
  store.setPointWithdrawn(1, true);
  assert.throws(() => store.appendPointRecord(point(2, 7)), /이미/);
  assert.equal(store.getState().pointCount, 1); assert.equal(store.getState().withdrawnPointCount, 1);
  store.setPointWithdrawn(1, false);
  store.updatePointRecord(1, { manualValues: { 'manual-condition': 5 }, note: '첫 위치' });
  store.setManualColumn({ ...condition, name: '위치', unit: 'm' });
  assert.deepEqual(store.getSamples(), raw);
  assert.deepEqual(store.getPointRecords().map(p => [p.pointRecordId, p.capturedSampleId, p.manualValues['manual-condition']]), [[1, 2, 5], [2, 5, 0]]);
  const source = store.getAnalysisSourceSnapshot('points');
  assert.deepEqual(source.availableIds, [2, 5]); assert.equal(source.timeOrigin, raw[0].receivedAt);
  assert.equal(readCell(source.rows[1], condition.id).value, 0);
  const context = { ...store.getRun().context, manualColumns: store.getRun().manualColumns };
  const calculate = createCalculator([{ id: 'calc-double', name: '두 배', unit: 'm', lhs: { kind: 'column', columnId: condition.id }, op: '*', rhs: { kind: 'constant', value: 2 } }], [], context);
  assert.equal(calculate(source.rows[0])['calc-double'].value, 10);
  const before = store.getSnapshot();
  for (const patch of [{ capturedSampleId: 1 }, { capturedAt: 0 }, { manualValues: { 'manual-condition': '3' } }])
    assert.throws(() => store.updatePointRecord(1, patch));
  assert.throws(() => store.setManualColumn({ ...condition, id: 'manual-other' }));
  assert.deepEqual(store.getSnapshot(), before);
  await store.flush();
  const reader = await openRunStore({ repository, id: 'test', locks: lockManager, timers });
  assert.throws(() => reader.setPointWithdrawn(1, true), /읽기 전용/);
  reader.dispose(); store.dispose();
});

for (const committed of [false, true]) test(`point edits during failed and in-flight saves survive retries (committed=${committed})`, async () => {
  const { store, repository } = await fixture(pointOptions());
  store.appendPointRecord(point(2, 2), sample(2));
  const commit = repository.commitBatch;
  let release;
  repository.commitBatch = async batch => {
    await new Promise(resolve => { release = resolve; });
    if (committed) await commit(batch);
    throw new Error('lost write');
  };
  const pending = store.flush();
  store.updatePointRecord(2, { manualValues: { 'manual-condition': 9 } });
  store.setPointWithdrawn(1, true);
  release(); await assert.rejects(pending, /lost write/);
  assert.equal(store.getState().status, 'error');
  assert.throws(() => store.appendPointRecord(point(3, 3), sample(3)), /저장 오류/);
  repository.commitBatch = commit;
  await store.flush();
  const saved = await repository.readSnapshot('test');
  assert.equal(saved.pointRecords.length, 2); assert.equal(saved.samples.length, 2);
  assert.equal(saved.pointRecords[1].manualValues['manual-condition'], 9);
  assert.equal(saved.pointRecords[0].withdrawn, true);
  assert.equal(store.getState().status, 'clean');
  store.dispose();
});

test('source workspaces merge independently and JSON preserves unapplied conditions and historical evidence', async () => {
  const { store, repository } = await fixture();
  for (let id = 1; id <= 10; id++) store.appendSample(sample(id));
  store.setManualColumn(condition); store.appendPointRecord(point(2, 5)); store.appendPointRecord(point(5, 10));
  const recorded = createWorkspace({ store });
  const inputSnapshot = store.getAnalysisSourceSnapshot('points').inputSnapshot;
  const state = { ...recorded.getState(), workspaceRevision: 1, analysisInputRevision: 1,
    selectedIds: [], appliedIds: [2, 5], inputSnapshot, graph: { xColumnId: condition.id, yColumnId: 'temperatureC', type: 'scatter' } };
  state.reflection.evidence = { ...captureEvidence(state), sourceId: 'points', inputSnapshot: structuredClone(inputSnapshot) };
  const commit = repository.commitBatch;
  let release;
  repository.commitBatch = async batch => { await new Promise(resolve => { release = resolve; }); return commit(batch); };
  const pending = store.flush();
  store.saveWorkspace('points', state);
  const captured = store.getSnapshot().workspace.bySource.points;
  recorded.exclude([1], '연속 기록에서만 제외');
  release(); await pending; repository.commitBatch = commit; await store.flush();
  assert.deepEqual((await repository.readSnapshot('test')).workspace.bySource.points, captured);
  assert.deepEqual(store.getSnapshot().workspace.bySource.points, captured);
  const recordedInputRevision = store.getSnapshot().workspace.bySource.recorded.analysisInputRevision;
  store.setActiveSource('points');
  assert.equal(store.getSnapshot().workspace.bySource.recorded.analysisInputRevision, recordedInputRevision);
  store.updatePointRecord(1, { manualValues: { 'manual-condition': 99 } }); store.setPointWithdrawn(2, true);
  store.setManualColumn({ ...condition, name: '바꾼 조건', unit: 'mm' });
  const saved = parseExperimentJson(buildExperimentJson(store.getSnapshot()));
  assert.deepEqual(saved.workspace.bySource.points, captured);
  assert.equal(saved.pointRecords[0].manualValues[condition.id], 99);
  for (const corrupt of [
    work => delete work.inputSnapshot,
    work => work.runId = 'another-run',
    work => work.appliedIds.push(1),
    work => work.inputSnapshot.points[1].capturedSampleId = 2,
    work => work.inputSnapshot.sourceRevision = saved.run.pointDataRevision + 1,
    work => work.inputSnapshot.points[0].manualValues[condition.id] = 'not numeric',
    work => work.reflection.evidence.inputSnapshot.points[0].capturedSampleId = 1,
  ]) {
    const invalid = structuredClone(saved); corrupt(invalid.workspace.bySource.points);
    assert.throws(() => prepareImportedSnapshot(invalid, { newId: () => { throw new Error('invalid data reached ID allocation'); } }),
      error => error.message !== 'invalid data reached ID allocation');
  }
  const evidence = saved.workspace.bySource.points.reflection.evidence;
  const model = evidenceGraph(pointSourceRows(saved.samples, evidence.inputSnapshot), evidence, [],
    { ...saved.run.context, manualColumns: evidence.inputSnapshot.manualColumns }, saved.samples[0].receivedAt);
  assert.deepEqual(model.points.map(p => p.x), [5, 10]); assert.equal(model.xUnit, 'cm');
  const imported = prepareImportedSnapshot(saved, { newId: () => 'imported' });
  assert.ok([...imported.samples, ...imported.pointRecords, imported.workspace, ...Object.values(imported.workspace.bySource)].every(record => record.runId === 'imported'));
  await store.flush(); assert.deepEqual((await repository.readSnapshot('test')).workspace, saved.workspace);
  store.dispose();
});

test('v1 remains readable and v2 rejects corrupt point identities, snapshots, and unsupported versions before import', async () => {
  const { store } = await fixture(pointOptions());
  store.appendPointRecord(point(2, 1), sample(2));
  const original = store.getSnapshot();
  for (const change of [
    data => data.pointRecords[0].runId = 'other',
    data => data.pointRecords[1].capturedSampleId = 1,
    data => data.pointRecords[0].capturedSampleId = 100,
    data => data.pointRecords.pop(),
    data => data.pointRecords[0].manualValues[condition.id] = Infinity,
    data => data.run.manualColumns.push({ ...condition, id: 'manual-second' }),
    data => data.run.recordingMode = null,
    data => data.run.schemaVersion = 99,
  ]) {
    const invalid = structuredClone(original); change(invalid);
    assert.throws(() => validateExperimentSnapshot(invalid));
  }
  const v1 = { run: { ...original.run, schemaVersion: 1 }, samples: original.samples, events: [], workspace: null };
  delete v1.run.recordingMode; delete v1.run.manualColumns; delete v1.run.pointDataRevision;
  const migrated = parseExperimentJson(JSON.stringify({ format: 'microbit-sensor-lab', fileVersion: 1, ...v1 }));
  assert.deepEqual(migrated.samples, original.samples); assert.equal(migrated.run.recordingMode, 'continuous');
  assert.deepEqual(migrated.pointRecords, []);
  v1.run.source = 'import';
  assert.equal(validateExperimentSnapshot(v1).run.recordingMode, null);
  store.dispose();
});
