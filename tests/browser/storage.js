// Real IndexedDB/Web Locks checks adapted from G/tests/browser.js.
import { createRepository } from '../../src/data/repository.js';
import { openRunStore } from '../../src/data/run-store.js';
import { getExperiment } from '../../src/catalog/index.js';
import { createWorkspace } from '../../src/analysis/workspace.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const expectFailure = async (action, message) => {
  let failed = false;
  try { await action(); } catch { failed = true; }
  check(failed, message);
};

export async function runStorageTests(report = (_message) => {}) {
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
    store.saveWorkspace({ ...store.getSnapshot().workspace, workspaceRevision: 2, note: 'analysis' });
    await store.flush();
    const snapshot = await repository.readSnapshot(id);
    check(snapshot.samples.length === 1 && snapshot.events.length === 1 && snapshot.workspace.workspaceRevision === 2
      && snapshot.run.lastSavedSampleId === 1, '네 저장소의 일괄 저장 실패');
    report('원자료·사건·분석·메타데이터의 실제 IndexedDB 일괄 저장');

    const retry = { ...snapshot, baseRunRevision: 1 };
    await repository.commitBatch(retry);
    check((await repository.readSnapshot(id)).samples.length === 1, '동일 묶음 재시도로 중복 생성');
    await expectFailure(() => repository.commitBatch({ ...retry, workspace: { ...snapshot.workspace, note: 'changed retry' } }), '동일 revision의 다른 분석 사본을 허용함');
    check((await repository.readSnapshot(id)).workspace.note === 'analysis', '실패한 재시도가 분석을 바꿈');
    report('동일 묶음 재시도·중복 방지·변경된 재시도 거부');

    await expectFailure(() => repository.commitBatch({ ...snapshot, baseRunRevision: snapshot.run.runRevision,
      run: { ...snapshot.run, runRevision: snapshot.run.runRevision + 1, lastSavedSampleId: 2 },
      samples: [{ ...snapshot.samples[0], sampleId: 2 }, { ...snapshot.samples[0], values: { temperatureC: 99, pressureHpa: 1000 } }],
      workspace: { ...snapshot.workspace, workspaceRevision: snapshot.workspace.workspaceRevision + 1, note: 'should roll back' },
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

    await store.remove();
    check(!await repository.readSnapshot(id) && !(await repository.readSamples(id)).length
      && !(await repository.readEvents(id)).length && !await repository.readWorkspace(id), '연관 레코드 삭제 누락');
    await expectFailure(() => repository.commitBatch({ ...changed, baseRunRevision: changed.run.runRevision,
      run: { ...changed.run, runRevision: changed.run.runRevision + 1 } }), '낡은 저장으로 삭제한 실험 부활');
    check(!await repository.readSnapshot(id), '삭제 이후 실험 부활');
    report('잠금 중 연관 데이터 전체 삭제·삭제 후 오래된 쓰기 차단');
  } finally {
    store?.dispose(); reader?.dispose(); repository.close();
    await globalThis.idb.deleteDB(databaseName);
  }
}
