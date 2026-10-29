// Real IndexedDB/Web Locks checks adapted from G/tests/browser.js.
import { createRepository } from '../../src/data/repository.js';
import { openRunStore } from '../../src/data/run-store.js';
import { getExperiment } from '../../src/catalog/index.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { parseExperimentJson, buildExperimentJson } from '../../src/data/files/json.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const expectFailure = async (action, message) => {
  let failed = false;
  try { await action(); } catch { failed = true; }
  check(failed, message);
};

export async function runStorageTests(report = (_message) => {}) {
  await verifyVersionUpgrade(report);
  await verifyPointTransactions(report);
  const databaseName = `microbit.sensor-lab.tests.${crypto.randomUUID()}`;
  const repository = createRepository({ databaseName });
  const timers = { setTimeout: () => 1, clearTimeout() {} };
  let store, reader;
  try {
    store = await openRunStore({ repository, create: true, context: getExperiment(), source: 'replay', timers });
    const id = store.getState().id;
    store.appendSample({ sampleId: 1, receivedAt: 1700000000000, values: { temperatureC: 25, pressureHpa: 1000 },
      validity: { temperatureC: 'valid', pressureHpa: 'valid' } });
    store.appendEvent({ receivedAt: 1700000000000, type: 'note', payload: { note: '처음' }, source: 'user' });
    createWorkspace({ store });
    store.saveWorkspace('recorded', { ...store.getSnapshot().workspace.bySource.recorded, workspaceRevision: 2, note: 'analysis' });
    await store.flush();
    const snapshot = await repository.readSnapshot(id);
    check(snapshot.samples.length === 1 && snapshot.events.length === 1 && snapshot.workspace.bySource.recorded.workspaceRevision === 2
      && snapshot.run.lastSavedSampleId === 1, '네 저장소의 일괄 저장 실패');
    report('원자료·사건·분석·메타데이터의 실제 IndexedDB 일괄 저장');

    const retry = { ...snapshot, baseRunRevision: 1 };
    await repository.commitBatch(retry);
    check((await repository.readSnapshot(id)).samples.length === 1, '동일 묶음 재시도로 중복 생성');
    await expectFailure(() => repository.commitBatch({ ...retry, workspace: { ...snapshot.workspace,
      bySource: { recorded: { ...snapshot.workspace.bySource.recorded, note: 'changed retry' } } } }), '동일 revision의 다른 분석 사본을 허용함');
    check((await repository.readSnapshot(id)).workspace.bySource.recorded.note === 'analysis', '실패한 재시도가 분석을 바꿈');
    report('동일 묶음 재시도·중복 방지·변경된 재시도 거부');

    await expectFailure(() => repository.commitBatch({ ...snapshot, baseRunRevision: snapshot.run.runRevision,
      run: { ...snapshot.run, runRevision: snapshot.run.runRevision + 1, lastSavedSampleId: 2 },
      samples: [{ ...snapshot.samples[0], sampleId: 2 }, { ...snapshot.samples[0], values: { temperatureC: 99, pressureHpa: 1000 } }],
      workspace: { ...snapshot.workspace, envelopeRevision: snapshot.workspace.envelopeRevision + 1,
        bySource: { recorded: { ...snapshot.workspace.bySource.recorded, workspaceRevision: 3, note: 'should roll back' } } },
    }), '원자료 덮어쓰기를 허용함');
    check(JSON.stringify(await repository.readSnapshot(id)) === JSON.stringify(snapshot), '충돌 시 묶음 전체 취소 실패');
    report('원자료 충돌 시 네 저장소 트랜잭션 전체 취소');

    reader = await openRunStore({ repository, id, timers });
    check(!reader.getState().writable, '두 번째 작성자를 허용함');
    await expectFailure(() => reader.remove(), '읽기 전용 실험 삭제를 허용함');
    await reader.close();
    report('Web Locks가 같은 실험의 두 번째 작성자·삭제를 차단');

    store.updateEventNote(1, '수정된 메모'); await store.flush();
    const changed = await repository.readSnapshot(id);
    check(changed.events[0].payload.note === '수정된 메모' && changed.events[0].receivedAt === snapshot.events[0].receivedAt
      && JSON.stringify(changed.samples) === JSON.stringify(snapshot.samples), '메모 편집이 원자료나 시각을 변경함');
    await expectFailure(() => repository.commitBatch({ ...snapshot, baseRunRevision: snapshot.run.runRevision,
      run: { ...snapshot.run, runRevision: snapshot.run.runRevision + 1 }, workspace: null }), '낡은 작성자 저장을 허용함');
    report('사용자 메모만 수정·낡은 작성자 충돌 거부');

    store.setEventWithdrawn(1, true); await store.flush();
    const withdrawn = parseExperimentJson(buildExperimentJson(await repository.readSnapshot(id)));
    check(withdrawn.events[0].payload.withdrawn === true && withdrawn.events[0].payload.note === '수정된 메모'
      && withdrawn.events[0].receivedAt === snapshot.events[0].receivedAt, '메모 취소 상태·내용·시각의 파일 왕복 실패');
    await expectFailure(() => repository.commitBatch({ ...withdrawn, baseRunRevision: withdrawn.run.runRevision,
      run: { ...withdrawn.run, runRevision: withdrawn.run.runRevision + 1 },
      events: [{ ...withdrawn.events[0], receivedAt: withdrawn.events[0].receivedAt + 1 }], workspace: null }), '메모 편집으로 시각 변경을 허용함');
    store.setEventWithdrawn(1, false); await store.flush();
    check((await repository.readSnapshot(id)).events[0].payload.withdrawn === false, '메모 복구 저장 실패');
    report('메모 취소·복구 저장과 파일 왕복·원래 시각 보존');

    store.setManualColumn({ id: 'manual-condition', name: '거리', unit: 'cm', type: 'number' });
    store.appendPointRecord({ capturedSampleId: 1, capturedAt: 1700000000100, manualValues: { 'manual-condition': 5 } });
    const input = store.getAnalysisSourceSnapshot('points');
    store.saveWorkspace('points', { ...store.getSnapshot().workspace.bySource.recorded, workspaceRevision: 1,
      inputSnapshot: input.inputSnapshot, graph: { xColumnId: 'manual-condition', yColumnId: 'temperatureC', type: 'scatter' } });
    store.setActiveSource('points'); await store.flush();
    const both = await repository.readSnapshot(id);
    check(both.workspace.bySource.recorded.note === 'analysis' && both.workspace.bySource.points.inputSnapshot.points[0].manualValues['manual-condition'] === 5,
      '자료별 분석 저장이 다른 자료를 덮어씀');
    store.updatePointRecord(1, { manualValues: { 'manual-condition': 10 } }); await store.flush();
    const edited = parseExperimentJson(buildExperimentJson(await repository.readSnapshot(id)));
    check(edited.pointRecords[0].manualValues['manual-condition'] === 10
      && edited.workspace.bySource.points.inputSnapshot.points[0].manualValues['manual-condition'] === 5,
    '조건 수정이 반영 전 분석 사본을 바꿈');
    report('점 조건 편집·자료별 분석 저장·반영 전 입력 사본 보존');

    await store.remove();
    check(!await repository.readSnapshot(id) && !(await repository.readSamples(id)).length
      && !(await repository.readEvents(id)).length && !await repository.readWorkspace(id), '연관 레코드 삭제 누락');
    check(!(await repository.readPointRecords(id)).length, '삭제한 실험의 점 기록이 남음');
    await expectFailure(() => repository.commitBatch({ ...changed, baseRunRevision: changed.run.runRevision,
      run: { ...changed.run, runRevision: changed.run.runRevision + 1 } }), '낡은 저장으로 삭제한 실험 부활');
    check(!await repository.readSnapshot(id), '삭제 이후 실험 부활');
    report('잠금 중 연관 데이터 전체 삭제·삭제 후 오래된 쓰기 차단');
  } finally {
    store?.dispose(); reader?.dispose(); repository.close();
    await globalThis.idb.deleteDB(databaseName);
  }
}

async function verifyVersionUpgrade(report) {
  const databaseName = `microbit.sensor-lab.upgrade.${crypto.randomUUID()}`;
  const parsed = parseExperimentJson(await (await fetch('/tests/fixtures/gay-lussac-v1.json')).text());
  const { recordingMode, manualColumns, pointDataRevision, ...oldRun } = parsed.run;
  const old = { run: { ...oldRun, schemaVersion: 1 }, samples: parsed.samples, events: parsed.events,
    workspace: parsed.workspace.bySource.recorded };
  const db = await globalThis.idb.openDB(databaseName, 1, { upgrade(database) {
    database.createObjectStore('runs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    database.createObjectStore('samples', { keyPath: ['runId', 'sampleId'] }).createIndex('runId', 'runId');
    database.createObjectStore('events', { keyPath: ['runId', 'eventId'] }).createIndex('runId', 'runId');
    database.createObjectStore('workspaces', { keyPath: 'runId' });
  } });
  const tx = db.transaction(['runs', 'samples', 'events', 'workspaces'], 'readwrite');
  await Promise.all([tx.objectStore('runs').put(old.run), tx.objectStore('workspaces').put(old.workspace),
    ...old.samples.map(sample => tx.objectStore('samples').put(sample)), ...old.events.map(event => tx.objectStore('events').put(event)), tx.done]);
  db.close();
  const repository = createRepository({ databaseName });
  try {
    const migrated = await repository.readSnapshot(old.run.id);
    check(migrated.run.schemaVersion === 2 && migrated.run.recordingMode === 'continuous', '기존 기록 방식 변환 실패');
    check(JSON.stringify(migrated.samples) === JSON.stringify(old.samples) && JSON.stringify(migrated.events) === JSON.stringify(old.events)
      && JSON.stringify(migrated.workspace.bySource.recorded) === JSON.stringify(old.workspace), 'DB 업그레이드에서 기존 원자료·분석·근거 손실');
    check(migrated.pointRecords.length === 0, '구형 자료에 점을 임의 생성함');
    const roundtrip = parseExperimentJson(buildExperimentJson(migrated));
    check(JSON.stringify(roundtrip.workspace) === JSON.stringify(migrated.workspace), '변환한 분석의 파일 왕복 손실');
    report('실제 IndexedDB v1→v2 변환: 기존 원자료·사건·분석·보관 근거 유지');
  } finally { repository.close(); await globalThis.idb.deleteDB(databaseName); }
}

async function verifyPointTransactions(report) {
  const databaseName = `microbit.sensor-lab.points.${crypto.randomUUID()}`;
  const repository = createRepository({ databaseName }), timers = { setTimeout: () => 1, clearTimeout() {} };
  let store;
  const sample = sampleId => ({ sampleId, receivedAt: 1700000000000 + sampleId * 100,
    values: { temperatureC: 25, pressureHpa: 1000 }, validity: { temperatureC: 'valid', pressureHpa: 'valid' } });
  try {
    store = await openRunStore({ repository, create: true, context: getExperiment(), source: 'replay', timers,
      recordingMode: 'point', initialPoint: { sample: sample(1), capturedAt: 1700000000200 } });
    const id = store.getState().id;
    store.appendPointRecord({ capturedAt: 1700000000300 }, sample(2)); await store.flush();
    const saved = await repository.readSnapshot(id);
    check(saved.samples.length === 2 && saved.pointRecords.length === 2, '수동 기록의 원자료·점 동시 저장 실패');
    await repository.commitBatch({ ...saved, baseRunRevision: 1 });
    check((await repository.readPointRecords(id)).length === 2, '재시도로 점 기록 중복');
    for (const point of [
      { ...saved.pointRecords[0], capturedAt: 0, revision: saved.run.pointDataRevision + 1 },
      { ...saved.pointRecords[0], pointRecordId: 3, revision: saved.run.pointDataRevision + 1 },
      { ...saved.pointRecords[0], pointRecordId: 3, capturedSampleId: 999, revision: saved.run.pointDataRevision + 1 },
    ]) {
      await expectFailure(() => repository.commitBatch({ run: { ...saved.run, runRevision: saved.run.runRevision + 1,
        pointDataRevision: saved.run.pointDataRevision + 1, lastSavedSampleId: 3 },
        samples: [{ ...sample(3), runId: id }], events: [], pointRecords: [point], workspace: null, baseRunRevision: saved.run.runRevision }),
      '잘못된 점 참조·중복·불변 항목 변경을 허용함');
      check(JSON.stringify(await repository.readSnapshot(id)) === JSON.stringify(saved), '실패한 점 저장이 고아 원자료를 남김');
    }
    await store.remove(); check(!(await repository.readPointRecords(id)).length, '점 기록 삭제 누락');
    report('실제 점 트랜잭션: 첫 생성·동시 저장·재시도·고아 참조 방지·삭제');
  } finally { store?.dispose(); repository.close(); await globalThis.idb.deleteDB(databaseName); }
}
