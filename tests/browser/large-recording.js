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
const timers = { setTimeout: () => 1, clearTimeout() {} };
const epoch = 1700000000000;
const reading = i => ({ type: 'reading', receivedAt: epoch + (i + 1) * 100, monotonicAt: (i + 1) * 100,
  values: { accelerationX: (i % 201 - 100) / 10, accelerationY: (i % 101 - 50) / 10,
    accelerationZ: 9.8, accelerationStrength: 10 + i / 36000 },
  validity: { accelerationX: 'valid', accelerationY: 'valid', accelerationZ: 'valid', accelerationStrength: 'valid' } });
const withoutRunId = ({ runId, ...record }) => record;

// One hour's volume at nominal 10 Hz. Bulk setup is a fixture; the tail tests
// real ingestion. This is not physical BLE endurance or battery evidence.
export async function runLargeRecordingTests(report = () => {}) {
  const databaseName = `microbit.sensor-lab.large-tests.${crypto.randomUUID()}`;
  const repository = createRepository({ databaseName }), stores = new Set();
  const context = getExperiment('accelerometer'); context.setup.simulated = true;
  let clock = 1700000000000, view, measurement, fixture;
  const costs = {}, chartCount = Object.keys(globalThis.Chart.instances).length;
  const timed = async (name, action) => {
    const start = performance.now(), result = await action();
    costs[name] = Math.round(performance.now() - start); return result;
  };
  try {
    const seed = await createLargeSnapshot(repository, 35800);
    await timed('seed', () => seedDatabase(databaseName, seed));
    const id = seed.run.id;
    clock = seed.samples.at(-1).receivedAt;
    const store = await openRunStore({ repository, id, timers, now: () => clock }); stores.add(store);
    const session = createSession({ store, clock: { utc: () => clock, mono: () => clock - epoch } });
    session.resume();
    await timed('appendAndSave', async () => {
      // Bulk data is a fixture. Both new batches use real Session/RunStore/Repository.
      for (let i = 35800; i < 36000; i++) {
        clock += 100;
        check(session.acceptInput(reading(i)), `기록 거부: ${i + 1}`);
        if ((i + 1) % 100 === 0) await store.flush();
      }
      await session.finish();
    });
    check(store.getState().status === 'clean' && store.getState().sampleCount === 36000, '36,000행 저장 누락');
    const original = store.getSnapshot();
    check(original.samples.every((sample, i) => sample.sampleId === i + 1
      && sample.receivedAt === 1700000000100 + i * 100
      && JSON.stringify(sample.values) === JSON.stringify(reading(i).values)
      && JSON.stringify(sample.validity) === JSON.stringify(reading(i).validity)), '수신 순서·시각·네 채널 값 손실');
    report(`4채널 36,000행 · 기존 35,800행 위에 실제 수신 200행·2회 증분 저장 ${costs.appendAndSave}ms`);

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
    check(!errors.length, errors.join('\n'));
    check(view.flush(), '대용량 분석 상태 저장 실패');
    await store.flush();
    const saved = store.getSnapshot();
    equal(saved.samples, original.samples, '분석 조작이 원자료 변경');
    view.dispose(); view = null;
    await store.close(); repository.close();
    const reopened = await timed('reopen', () => openRunStore({ repository, id, timers })); stores.add(reopened);
    equal(reopened.getSnapshot(), saved, 'DB 연결 종료 후 재열기 손실');
    report(`36,000행 · 가상 표 끝·전체 그래프·원자료 보존·DB 재열기`);

    const json = await timed('jsonExport', () => buildExperimentJson(saved));
    const parsed = await timed('jsonParse', () => parseExperimentJson(json));
    equal(parsed.samples, saved.samples, '대용량 JSON 원자료 손실');
    equal(parsed.events, saved.events, '대용량 JSON 조작 기록 손실');
    equal(parsed.workspace, saved.workspace, '대용량 JSON 분석 상태 손실');
    const csv = await timed('csvExport', () => buildCsv(saved));
    const csvParsed = await timed('csvParse', () => parseExperimentCsv(csv));
    equal(csvParsed.samples.map(s => [s.receivedAt, s.values, s.validity]), saved.samples.map(s => [s.receivedAt, s.values, s.validity]), '대용량 CSV 시각·값·유효성 손실');
    equal(await repository.readSnapshot(id), saved, '파일 왕복이 원본 DB 변경');
    report(`JSON ${(new Blob([json]).size / 1048576).toFixed(1)}MiB·CSV ${(new Blob([csv]).size / 1048576).toFixed(1)}MiB 왕복 · 전체 원자료·조작·분석 상태 보존`);
    report(`소요 시간(ms): ${JSON.stringify(costs)}`);
  } finally {
    view?.dispose(); measurement?.dispose(); fixture?.dispose();
    for (const store of stores) store.dispose();
    repository.close(); await globalThis.idb.deleteDB(databaseName);
  }
  check(Object.keys(globalThis.Chart.instances).length === chartCount, '대용량 분석 종료 후 차트 누적');
}

// One canonical sample and metadata come from the public recording API.
// Remaining rows are setup, not evidence for ingestion or production DB import.
async function createLargeSnapshot(repository, count) {
  const context = getExperiment('accelerometer'); context.setup.simulated = true;
  const store = await openRunStore({ repository, create: true, context, source: 'replay', timers, now: () => epoch });
  try {
    const session = createSession({ store, clock: { utc: () => epoch, mono: () => 0 } });
    session.start(); session.acceptInput(reading(0)); await session.pause();
    const snapshot = store.getSnapshot(), template = snapshot.samples[0];
    snapshot.samples = Array.from({ length: count }, (_, i) => {
      const { receivedAt, values, validity } = reading(i);
      return { ...template, sampleId: i + 1, receivedAt, values, validity };
    });
    snapshot.run.lastSavedSampleId = count;
    snapshot.run.updatedAt = snapshot.samples.at(-1).receivedAt;
    snapshot.run.runRevision++;
    return snapshot;
  } finally { await store.close(); }
}

async function seedDatabase(databaseName, snapshot) {
  const db = await globalThis.idb.openDB(databaseName);
  try {
    const tx = db.transaction(['runs', 'samples'], 'readwrite');
    await Promise.all([tx.objectStore('runs').put(snapshot.run),
      ...snapshot.samples.map(sample => tx.objectStore('samples').put(sample)), tx.done]);
  } finally { db.close(); }
}

// Opt-in bulk import coverage. Small-file import/rollback stays in the regular suite.
export async function runLargeImportTests(report = () => {}) {
  const databaseName = `microbit.sensor-lab.large-import.${crypto.randomUUID()}`;
  const repository = createRepository({ databaseName });
  let imported, reopened;
  try {
    const snapshot = await createLargeSnapshot(repository, 36000);
    const parsed = parseExperimentJson(buildExperimentJson(snapshot));
    const start = performance.now();
    imported = await importRunSnapshot({ repository, snapshot: parsed, timers });
    const id = imported.getState().id;
    check(id !== snapshot.run.id, '대용량 가져오기가 원본 실험을 덮어씀');
    const saved = imported.getSnapshot();
    equal(saved.samples.map(withoutRunId), snapshot.samples.map(withoutRunId), '대용량 가져오기 원자료 손실');
    equal(saved.events.map(withoutRunId), snapshot.events.map(withoutRunId), '대용량 가져오기 조작 기록 손실');
    await imported.close(); repository.close();
    reopened = await openRunStore({ repository, id, timers });
    equal(reopened.getSnapshot(), saved, '가져온 대용량 DB 재열기 손실');
    report(`36,000행 실제 JSON→IndexedDB 가져오기·DB 재열기 ${Math.round(performance.now() - start)}ms`);
  } finally {
    imported?.dispose(); reopened?.dispose(); repository.close();
    await globalThis.idb.deleteDB(databaseName);
  }
}
