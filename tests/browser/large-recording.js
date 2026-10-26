import { getExperiment } from '../../src/catalog/index.js';
import { createRepository } from '../../src/data/repository.js';
import { openRunStore, importRunSnapshot } from '../../src/data/run-store.js';
import { createSession } from '../../src/measurement/session.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';
import { buildCsv, parseExperimentCsv } from '../../src/data/files/csv.js';
import { createAnalysisView } from '../../src/ui/analysis-view.js';
import { createMeasurementView } from '../../src/ui/measurement-view.js';
import { mountLabFixture, clickLabControl } from './lab-fixture.js';

const check = (value, message) => { if (!value) throw new Error(message); };
const equal = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const withoutRunId = ({ runId, ...record }) => record;

// One hour's volume at nominal 10 Hz, replayed faster than real time. This is
// not evidence for physical BLE endurance, background recording or battery life.
export async function runLargeRecordingTests(report = () => {}) {
  const databaseName = `microbit.sensor-lab.large-tests.${crypto.randomUUID()}`;
  const repository = createRepository({ databaseName }), stores = new Set();
  const timers = { setTimeout: () => 1, clearTimeout() {} };
  const context = getExperiment('accelerometer'); context.setup.simulated = true;
  let clock = 1700000000000, view, measurement, fixture;
  const costs = {}, chartCount = Object.keys(globalThis.Chart.instances).length;
  const timed = async (name, action) => {
    const start = performance.now(), result = await action();
    costs[name] = Math.round(performance.now() - start); return result;
  };
  const reading = i => ({ type: 'reading', receivedAt: clock, monotonicAt: clock - 1700000000000,
    values: { accelerationX: (i % 201 - 100) / 10, accelerationY: (i % 101 - 50) / 10,
      accelerationZ: 9.8, accelerationStrength: 10 + i / 36000 },
    validity: { accelerationX: 'valid', accelerationY: 'valid', accelerationZ: 'valid', accelerationStrength: 'valid' } });
  try {
    const store = await openRunStore({ repository, create: true, context, source: 'replay', timers, now: () => clock }); stores.add(store);
    const id = store.getState().id;
    const session = createSession({ store, clock: { utc: () => clock, mono: () => clock - 1700000000000 } });
    session.start();
    await timed('recordAndSave', async () => {
      for (let i = 0; i < 36000; i++) {
        clock += 100;
        check(session.acceptInput(reading(i)), `기록 거부: ${i + 1}`);
        // Exercise repeated incremental transactions, not a single bulk import.
        if ((i + 1) % 600 === 0) await store.flush();
      }
      await session.pause();
    });
    check(store.getState().status === 'clean' && store.getState().sampleCount === 36000, '36,000행 저장 누락');
    const original = store.getSnapshot();
    check(original.samples.every((sample, i) => sample.sampleId === i + 1
      && sample.receivedAt === 1700000000100 + i * 100
      && JSON.stringify(sample.values) === JSON.stringify(reading(i).values)), '수신 순서·시각·네 채널 값 손실');
    report(`4채널 36,000행 · Session 기록·60회 증분 IndexedDB 저장 ${costs.recordAndSave}ms (시간 압축 입력)`);

    fixture = await mountLabFixture({ component: true }); fixture.showScreen('measure');
    const liveOptions = { context, store, latest: null, previewPoints: [], device: { status: 'disconnected', confirmed: false }, recording: false };
    measurement = createMeasurementView(fixture.host, () => measurement.render(liveOptions));
    measurement.render(liveOptions);
    const liveChart = () => globalThis.Chart.getChart(fixture.host.querySelector('#live-chart'));
    check(liveChart().data.datasets[0].data.filter(p => p.sampleId).length === 601, '대용량 기록의 최근 60초 범위 오류');
    await timed('liveAllChannels', async () => {
      for (const input of fixture.host.querySelectorAll('#display-channels input')) {
        if (!input.checked) clickLabControl(fixture.host, input);
      }
      clickLabControl(fixture.host, '[data-live-range="all"]'); await settle();
    });
    check(liveChart().data.datasets.slice(0, 4).every(d => d.data.filter(p => p.sampleId).length === 36000), '전체 측정 그래프의 네 채널 누락');
    measurement.dispose(); measurement = null;
    fixture.showScreen('analysis');
    const root = fixture.host.querySelector('[data-screen="analysis"]'), errors = [];
    const $ = selector => root.querySelector(selector);
    view = createAnalysisView(root, { onError: message => errors.push(message) });
    await timed('analysisOpen', async () => { view.open(store); await settle(); });
    const click = async selector => { clickLabControl(fixture.host, selector); await settle(); check(!$('#analysis-feedback').textContent, $('#analysis-feedback').textContent); };
    await click('#overview-table-toggle');
    await timed('tableEnd', async () => {
      const scroller = $('#raw-scroll'); scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll')); await settle();
    });
    check($('#raw-rows [data-sample-id="36000"]') && $('#raw-rows').querySelectorAll('.sample-row').length < 100, '36,000행 가상 표 끝 접근·DOM 제한 실패');
    await timed('relationship', () => click('#tab-relationship'));
    check(view.getWorkspace().getGraphData().points.length === 36000, '관계 그래프의 원자료 손실');
    await timed('regression', () => click('#trend-enabled'));
    const fit = view.getWorkspace().getGraphData().regression.result;
    check(fit.count === 36000 && Math.abs(fit.slope - 1 / 3600) < 1e-12
      && Math.abs(fit.intercept - 10) < 1e-10 && Math.abs(fit.rSquared - 1) < 1e-12, '대용량 회귀 수치 오차');
    await click('#use-graph-for-reflection');
    $('#reflection-observation').value = '한 시간 분량의 자료를 비교했다.';
    $('#reflection-observation').dispatchEvent(new Event('input', { bubbles: true }));
    check(view.flush(), '대용량 분석 초안 확정 실패');
    const evidence = view.getWorkspace().getState().reflection;
    check(!errors.length, errors.join('\n'));

    // Continue recording while analysis holds an explicit snapshot. Rendering,
    // new-data import and later exports must not rewrite the captured evidence.
    session.resume();
    for (let i = 36000; i < 36100; i++) { clock += 100; session.acceptInput(reading(i)); }
    await session.finish(); view.updateStatus();
    check(view.getWorkspace().getLoadedCount() === 36000 && !$('#apply-new-data').hidden, '새 수신의 분석 자동 반영');
    await click('#tab-relationship');
    await timed('applyNewData', () => click('#apply-new-data'));
    check(view.getWorkspace().getLoadedCount() === 36100, '새 자료 반영 누락');
    equal(view.getWorkspace().getState().reflection, evidence, '추가 수신이 보관 근거·해석을 변경');
    const png = await timed('png', () => view.exportPng('대용량 검증'));
    const image = new Image(); image.src = png; await image.decode();
    check(image.width === 1200, '대용량 그래프 PNG 출력 실패');
    await store.flush();
    const saved = store.getSnapshot();
    equal(saved.samples.slice(0, 36000), original.samples, '분석 조작이 원자료 변경');
    view.dispose(); view = null;
    await store.close(); repository.close();
    const reopened = await timed('reopen', () => openRunStore({ repository, id, timers })); stores.add(reopened);
    equal(reopened.getSnapshot(), saved, 'DB 연결 종료 후 재열기 손실');
    report(`36,100행 · 가상 표·관계 그래프·회귀·PNG·명시적 새 자료 반영·근거 보존·DB 재열기`);

    const json = await timed('jsonExport', () => buildExperimentJson(saved));
    const parsed = await timed('jsonParse', () => parseExperimentJson(json));
    const imported = await timed('jsonImport', () => importRunSnapshot({ repository, snapshot: parsed, timers })); stores.add(imported);
    const restored = imported.getSnapshot();
    check(restored.run.id !== id, 'JSON 가져오기가 원본 실험을 덮어씀');
    equal(restored.samples.map(withoutRunId), saved.samples.map(withoutRunId), '대용량 JSON 원자료 손실');
    equal(restored.events.map(withoutRunId), saved.events.map(withoutRunId), '대용량 JSON 조작 기록 손실');
    equal(withoutRunId(restored.workspace), withoutRunId(saved.workspace), '대용량 JSON 분석·해석 손실');
    const csv = await timed('csvExport', () => buildCsv(saved));
    const csvParsed = await timed('csvParse', () => parseExperimentCsv(csv));
    equal(csvParsed.samples.map(s => [s.receivedAt, s.values, s.validity]), saved.samples.map(s => [s.receivedAt, s.values, s.validity]), '대용량 CSV 시각·값·유효성 손실');
    equal(await repository.readSnapshot(id), saved, '파일 왕복이 원본 DB 변경');
    report(`JSON ${(new Blob([json]).size / 1048576).toFixed(1)}MiB·CSV ${(new Blob([csv]).size / 1048576).toFixed(1)}MiB 왕복 · 원자료·조작·분석·해석 보존`);
    report(`소요 시간(ms): ${JSON.stringify(costs)}`);
  } finally {
    view?.dispose(); measurement?.dispose(); fixture?.dispose();
    for (const store of stores) store.dispose();
    repository.close(); await globalThis.idb.deleteDB(databaseName);
  }
  check(Object.keys(globalThis.Chart.instances).length === chartCount, '대용량 분석 종료 후 차트 누적');
}
