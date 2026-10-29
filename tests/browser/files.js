// Compatibility checks using the browser's real Papa Parse, IndexedDB and Web Locks.
import { createRepository } from '../../src/data/repository.js';
import { importRunSnapshot, openRunStore } from '../../src/data/run-store.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';
import { buildCsv, buildAnalysisCsv, parseExperimentCsv } from '../../src/data/files/csv.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { assertJsonEqual as equal } from '../helpers/json-equality.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const expectFailure = async (action, message) => {
  let failed = false;
  try { await action(); } catch { failed = true; }
  check(failed, message);
};
const withoutRunId = ({ runId, ...record }) => record;
// Catalog labels and quantity metadata are new; legacy points, scope and fits
// must still match the original numerical model exactly.
const withoutLabels = ({ xLabel, yLabel, yQuantity, yQuantityLabel, ...model }) => model;
async function fixture(name) {
  const response = await fetch(new URL(`../fixtures/${name}`, import.meta.url));
  check(response.ok, `호환성 픽스처를 읽지 못했어요: ${name}`);
  return response.text();
}

export async function runFileTests(report = (_message) => {}) {
  check(typeof globalThis.Papa?.parse === 'function', '실제 Papa Parse 배포본이 필요합니다.');
  check(globalThis.indexedDB && globalThis.navigator?.locks, '실제 IndexedDB와 Web Locks가 필요합니다.');
  const databaseName = `microbit.sensor-lab.file-tests.${crypto.randomUUID()}`;
  const repository = createRepository({ databaseName }), stores = new Set();
  const timers = { setTimeout: () => 1, clearTimeout() {} };
  try {
    const [v1, v2, rawCsv, analysisCsv, dashboardCsv, originalText] = await Promise.all([
      fixture('gay-lussac-v1.json'), fixture('gay-lussac-v2.json'), fixture('gay-lussac-raw.csv'),
      fixture('gay-lussac-analysis.csv'), fixture('dashboard-default.csv'), fixture('gay-lussac-expected.json'),
    ]);
    const original = JSON.parse(originalText), first = parseExperimentJson(v1), second = parseExperimentJson(v2);
    equal(first.samples, second.samples, '구형 JSON 버전에 따라 원자료가 달라짐');
    const imported = await importRunSnapshot({ repository, snapshot: first, timers }); stores.add(imported);
    const firstId = imported.getState().id, saved = imported.getSnapshot();
    check(firstId !== first.run.id && saved.samples.every(s => s.runId === firstId)
      && saved.events.every(e => e.runId === firstId) && saved.workspace.runId === firstId, '구형 JSON의 실험 참조 연결 실패');
    await imported.close();
    const reopened = await openRunStore({ repository, id: firstId, timers }); stores.add(reopened);
    equal(reopened.getSnapshot(), saved, '브라우저 저장소 재열기에 원자료·분석 손실');
    const work = createWorkspace({ store: reopened });
    equal(withoutLabels(work.getGraphData()), withoutLabels(original.graph), '원본과 브라우저 복원 그래프의 수치가 다름');
    equal(withoutLabels(work.getReflectionModel()), withoutLabels(original.reflection), '원본 보관 근거의 수치가 달라짐');
    report('게이뤼삭 JSON v1: 새 ID로 실제 DB 저장·재열기·원본 회귀와 보관 근거 일치');

    const compact = await importRunSnapshot({ repository, snapshot: second, timers }); stores.add(compact);
    check(compact.getState().id !== firstId, '구형 v2 가져오기가 기존 실험을 덮어씀');
    equal(compact.getSnapshot().samples.map(withoutRunId), saved.samples.map(withoutRunId), '구형 v2 원자료 복원 손실');
    const exported = buildExperimentJson(reopened.getSnapshot());
    const reimported = await importRunSnapshot({ repository, snapshot: parseExperimentJson(exported), timers }); stores.add(reimported);
    const roundtrip = reimported.getSnapshot();
    equal(roundtrip.samples.map(withoutRunId), saved.samples.map(withoutRunId), '새 전체 실험 JSON 원자료 왕복 손실');
    equal(roundtrip.workspace, { ...saved.workspace, runId: roundtrip.run.id,
      bySource: Object.fromEntries(Object.entries(saved.workspace.bySource).map(([sourceId, state]) =>
        [sourceId, { ...state, runId: roundtrip.run.id }])) }, '새 전체 실험 JSON 분석·해석 왕복 손실');
    equal(roundtrip.events.map(withoutRunId), saved.events.map(withoutRunId), '새 전체 실험 JSON 사건 왕복 손실');
    report('게이뤼삭 JSON v2 및 새 전체 실험 JSON의 실제 DB 왕복·독립 Run 생성');

    const options = { id: 'browser-csv', now: 1700000000000, filename: '호환성 검사.csv' };
    check(parseExperimentCsv(rawCsv, options).samples.length === 6, '기존 원자료 CSV 복원 실패');
    const analysis = parseExperimentCsv(analysisCsv, options);
    equal(analysis.samples.map(s => s.sourceSampleId), [1, 3, 4], '기존 분석 CSV 범위·원본 ID 손실');
    check(analysis.samples[0].importedValues['data-calc-divide'].value === null
      && analysis.samples[1].importedValues['data-calc-divide'].value === 503 && analysis.workspace === null, 'CSV 계산값·실패 사유 복원 실패');
    const magnetic = parseExperimentCsv(dashboardCsv, options);
    check(magnetic.samples[0].values.x === 0 && magnetic.samples[0].values.y === -12.5
      && magnetic.samples[1].receivedAt < magnetic.samples[0].receivedAt, '기존 대시보드 CSV의 0·음수·시각 손실');
    const csvRoundtrip = parseExperimentCsv(buildAnalysisCsv(saved), options);
    equal(csvRoundtrip.samples.map(s => s.sourceSampleId), [1, 3, 4], '새 분석 CSV가 표 필터와 분석 범위를 혼합함');
    const undated = parseExperimentCsv('volts\n0\n-2.5', { ...options, mapping: { confirmed: true, timestamp: null,
      columns: [{ header: 'volts', id: 'voltage', name: '전압', unit: 'V' }] } });
    check(parseExperimentCsv(buildCsv(undated), options).samples.every(s => s.receivedAt === null), '없는 측정 시각이 생성됨');
    const csvStore = await importRunSnapshot({ repository, snapshot: csvRoundtrip, timers }); stores.add(csvStore);
    check((await repository.readSnapshot(csvStore.getState().id)).samples[1].importedValues['data-calc-divide'].value === 503, 'CSV 계산값의 실제 DB 저장 실패');
    report('실제 Papa Parse로 기존·신규 CSV 복원, 계산값 고정, 시각 없는 CSV 보존과 DB 저장');

    const beforeRuns = await repository.listRuns(), beforeExisting = await repository.readSnapshot(firstId);
    const invalid = structuredClone(second); invalid.workspace.bySource.recorded.reflection.evidence.appliedIds.push(999);
    await expectFailure(() => importRunSnapshot({ repository, snapshot: invalid, timers }), '없는 근거 자료 참조를 가져옴');
    const malformedContent = structuredClone(second); malformedContent.run.context.activity.memoPresets = { text: '배열 아님' };
    await expectFailure(() => importRunSnapshot({ repository, snapshot: malformedContent, timers }), '잘못된 화면 안내 형식을 가져옴');
    equal(await repository.listRuns(), beforeRuns, '실패한 파일 검증이 일부 Run을 생성함');
    equal(await repository.readSnapshot(firstId), beforeExisting, '실패한 파일 검증이 열린 실험을 변경함');

    // Fail after the transaction has attempted sample writes, not merely before it opens.
    let failedId;
    const failingRepository = { ...repository, async commitBatch(batch) {
      failedId = batch.run.id;
      return repository.commitBatch({ ...batch, events: [...batch.events,
        { runId: 'different-run', eventId: batch.events.length + 1, receivedAt: 1700000000000, type: 'note', payload: {}, source: 'user' }] });
    } };
    await expectFailure(() => importRunSnapshot({ repository: failingRepository, snapshot: second, timers }), '중간 DB 충돌이 성공으로 처리됨');
    check(failedId && !await repository.readSnapshot(failedId) && !(await repository.readSamples(failedId)).length
      && !(await repository.readEvents(failedId)).length && !await repository.readWorkspace(failedId), '실패한 가져오기의 일부 레코드가 DB에 남음');
    equal(await repository.listRuns(), beforeRuns, '중간 DB 오류가 기존 실험 목록을 바꿈');
    equal(await repository.readSnapshot(firstId), beforeExisting, '중간 DB 오류가 기존 실험 내용을 바꿈');
    report('잘못된 파일의 변경 전 거부·실제 DB 중간 충돌 시 모든 레코드 취소·기존 Run 보존');
  } finally {
    for (const store of stores) store.dispose();
    repository.close();
    await globalThis.idb.deleteDB(databaseName);
  }
}
