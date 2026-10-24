import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { buildExperimentJson, parseExperimentJson, prepareImportedSnapshot } from '../../src/data/files/json.js';
import { buildCsv, buildAnalysisCsv, parseExperimentCsv, analysisExportInfo } from '../../src/data/files/csv.js';
import { validateExperimentSnapshot } from '../../src/data/files/validation.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { LIMITS } from '../../src/domain/limits.js';

const fixture = name => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const vendor = { module: { exports: {} }, exports: {} };
runInNewContext(await readFile(new URL('../../public/vendor/papaparse-5.7.0.min.js', import.meta.url), 'utf8'), vendor);
globalThis.Papa = vendor.module.exports;
const legacy1 = await fixture('gay-lussac-v1.json'), legacy2 = await fixture('gay-lussac-v2.json');
const expected = JSON.parse(await fixture('gay-lussac-expected.json'));
const options = { id: 'csv-test', now: 1700000000000, filename: '가져온 실험.csv' };
const open = snapshot => createWorkspace({ store: { getSnapshot: () => structuredClone(snapshot),
  getState: () => ({ writable: false }) } });
// Channel wording and quantity metadata belong to the catalog; the original
// numeric models (points, scope, regression and extension) remain exact.
const withoutLabels = ({ xLabel, yLabel, yQuantity, yQuantityLabel, ...model }) => model;

test('original-generated JSON v1/v2 preserve every raw field, time, event and workspace; numerical results match original', () => {
  const one = parseExperimentJson(legacy1), two = parseExperimentJson(legacy2);
  assert.deepEqual(one.samples, two.samples);
  assert.deepEqual(one.events, expected.snapshot.events);
  assert.deepEqual(one.workspace, expected.snapshot.workspace);
  for (const [i, sample] of one.samples.entries()) {
    const { temperatureC, pressureHpa, validity, ...rest } = expected.snapshot.samples[i];
    assert.deepEqual(sample, { ...rest, values: { temperatureC, pressureHpa },
      validity: { temperatureC: validity.temperatureC, pressureHpa: validity.pressureHpa },
      rawExtra: { legacyValidity: { humidityPct: validity.humidityPct } } });
  }
  assert.equal(one.run.context.activity.id, 'gay-lussac');
  assert.deepEqual(withoutLabels(open(one).getGraphData()), withoutLabels(expected.graph));
  assert.deepEqual(withoutLabels(open(two).getReflectionModel()), withoutLabels(expected.reflection));
  assert.deepEqual(analysisExportInfo(one).rows.map(s => s.sampleId), [1, 3, 4]);
});

test('new full file roundtrip retains pending records, irregular times, missing values and fixed reflection without mutation', () => {
  const snapshot = parseExperimentJson(legacy2);
  snapshot.samples[4].values.temperatureC = null; snapshot.samples[4].validity.temperatureC = 'missing';
  snapshot.samples[5].receivedAt = snapshot.samples[4].receivedAt - 37;
  snapshot.samples[5].values.temperatureC = -140.123456789; snapshot.samples[5].validity.temperatureC = 'out-of-range';
  snapshot.samples[5].sourceSampleId = 91;
  const before = structuredClone(snapshot), text = buildExperimentJson(snapshot), restored = parseExperimentJson(text);
  assert.equal(JSON.parse(text).format, 'microbit-sensor-lab'); assert.equal(JSON.parse(text).fileVersion, 1);
  assert.deepEqual(restored, snapshot); assert.deepEqual(snapshot, before);
  assert.equal(restored.samples.length, 6); assert.equal(restored.run.lastSavedSampleId, 4);
  restored.samples[0].validity.temperatureC = 'missing';
  assert.equal(restored.samples[1].validity.temperatureC, 'valid');
});

test('every import gets a fresh Run ID and consistently remaps nested references while retaining original provenance', () => {
  const snapshot = parseExperimentJson(legacy2);
  snapshot.events[0].payload.link = { runId: snapshot.run.id, sampleId: 1 };
  const before = structuredClone(snapshot), data = prepareImportedSnapshot(snapshot, { newId: () => 'new-run', now: () => 1700000010000 });
  assert.equal(data.run.id, 'new-run'); assert.equal(data.run.runRevision, 1); assert.equal(data.run.status, 'paused');
  assert.equal(data.run.importedFrom.runId, 'legacy-original'); assert.equal(data.run.provenance.runId, 'legacy-original');
  assert.ok([...data.samples, ...data.events, data.workspace].every(r => r.runId === 'new-run'));
  assert.equal(data.events[0].payload.link.runId, 'new-run');
  assert.deepEqual(data.workspace.reflection, snapshot.workspace.reflection);
  assert.deepEqual(snapshot, before);
  assert.throws(() => prepareImportedSnapshot(snapshot, { newId: () => snapshot.run.id }), /새로운 ID/);
});

test('invalid references, cycles, unsafe keys and unknown versions are rejected before import preparation', () => {
  const changes = [
    s => s.samples[1].sampleId = 1,
    s => s.samples[0].values.temperatureC = null,
    s => s.events[0].runId = 'other',
    s => s.workspace.appliedIds.push(999),
    s => s.workspace.exclusions[0].sampleId = 999,
    s => s.workspace.graph.xColumnId = 'gone',
    s => s.workspace.calculatedColumns[0].lhs = { kind: 'column', columnId: 'calc-kelvin' },
    s => s.workspace.reflection.evidence.appliedIds.push(999),
    s => s.workspace.reflection.answers.reasoning = 'x'.repeat(1201),
    s => s.workspace.analysisRange.endAt -= 1000,
    s => { s.workspace = null; s.run.context.defaultGraph.yColumnId = 'gone'; },
  ];
  let ids = 0;
  for (const change of changes) {
    const bad = parseExperimentJson(legacy1); change(bad);
    assert.throws(() => validateExperimentSnapshot(bad));
    assert.throws(() => prepareImportedSnapshot(bad, { newId: () => { ids++; return 'new'; } }));
  }
  assert.equal(ids, 0);
  assert.throws(() => parseExperimentJson('{"format":"microbit-sensor-lab","fileVersion":999}'), /버전/);
  assert.throws(() => parseExperimentJson('{"__proto__":{"polluted":true}}'), /속성/);
  assert.throws(() => parseExperimentJson('{oops'), /JSON/);
});

test('malformed presentation metadata and long names fail before creating an imported Run', () => {
  const changes = [
    s => s.run.name = '가'.repeat(121), s => s.run.name = '   ',
    s => s.run.context.preparation = {},
    s => s.run.context.preparation = [null],
    s => s.run.context.activity.events = 'broken',
    s => s.run.context.activity.events = [{ type: 'note', label: {} }],
    s => s.run.context.questions = {},
    s => s.run.context.questions[0].id = 'unexpected',
    s => s.run.context.questions[0].question = [],
    s => s.run.context.analysisTemplates = {},
    s => s.run.context.analysisTemplates[0].columns[0].lhs.columnId = 'missing-channel',
    s => s.run.context.analysisTemplates[0].columns[0].lhs.columnId = 'calc-kelvin',
    s => s.run.context.channels[0].digits = 1000,
    s => s.workspace.reflection.answers.unexpected = '보존되지 않을 답변',
  ];
  let allocations = 0;
  for (const change of changes) {
    const invalid = parseExperimentJson(legacy1); change(invalid);
    assert.throws(() => prepareImportedSnapshot(invalid, { newId: () => { allocations++; return 'never-created'; } }));
  }
  assert.equal(allocations, 0);
  const snapshot = parseExperimentJson(legacy2); snapshot.run.context.sourceInformation = { note: '원본의 알려지지 않은 참고 정보' };
  assert.deepEqual(parseExperimentJson(buildExperimentJson(snapshot)).run.context.sourceInformation, snapshot.run.context.sourceInformation);
});

test('legacy compact samples reject malformed patches, row overflow and oversized expansion before allocating records', () => {
  const file = JSON.parse(legacy2);
  const changes = [p => p.columns[0] = 'receivedAt', p => p.defaults.temperatureC = 0,
    p => p.rows[0].pop(), p => p.overrides = [[0, {}, ['runId', 'runId']]],
    p => p.overrides = [[1, {}, []], [1, {}, []]], p => p.overrides = [[0, { runId: 'x' }, ['runId']]]];
  for (const change of changes) { const bad = structuredClone(file); change(bad.snapshot.samples); assert.throws(() => parseExperimentJson(JSON.stringify(bad)), /실험 파일/); }
  const huge = structuredClone(file); huge.snapshot.samples.defaults.note = 'x'.repeat(500000);
  huge.snapshot.samples.rows = Array.from({ length: 80 }, (_, i) => [i + 1, 1700000000000, 25, 1000]);
  assert.throws(() => parseExperimentJson(JSON.stringify(huge)), /복원할 자료가 너무 큽니다/);
  const tooMany = structuredClone(file); tooMany.snapshot.samples.rows = Array.from({ length: LIMITS.maxSamples + 1 }, (_, i) => [i + 1, 1700000000000, 25, 1000]);
  assert.throws(() => parseExperimentJson(JSON.stringify(tooMany)), /실험 파일/);
  assert.throws(() => parseExperimentJson(' '.repeat(LIMITS.maxFileBytes + 1)), /32 MiB/);
});

test('the shared admission limits reject 17 raw columns and 33 calculations before changing the source', () => {
  const snapshot = parseExperimentJson(legacy2), before = structuredClone(snapshot);
  const tooWide = structuredClone(snapshot);
  tooWide.run.context.channels = Array.from({ length: LIMITS.maxChannels + 1 }, (_, i) => ({ id: `channel${i}`, name: `값 ${i}`, unit: null }));
  assert.throws(() => validateExperimentSnapshot(tooWide), /16/);
  const tooMany = structuredClone(snapshot);
  tooMany.workspace.calculatedColumns = Array.from({ length: LIMITS.maxCalculatedColumns + 1 }, (_, i) => ({
    id: `calc-${i}`, name: `계산 ${i}`, unit: null,
    lhs: { kind: 'column', columnId: 'temperatureC' }, op: '+', rhs: { kind: 'constant', value: i },
  }));
  assert.throws(() => validateExperimentSnapshot(tooMany), /32/);
  assert.deepEqual(snapshot, before);
});

test('original raw/analysis CSV and dashboard CSV retain numbers, source IDs and fixed calculation results', async () => {
  const raw = parseExperimentCsv(await fixture('gay-lussac-raw.csv'), options);
  assert.deepEqual(raw.samples.map(s => s.values), expected.snapshot.samples.map(s => ({ temperatureC: s.temperatureC, pressureHpa: s.pressureHpa })));
  const analysis = parseExperimentCsv(await fixture('gay-lussac-analysis.csv'), options);
  assert.deepEqual(analysis.samples.map(s => s.sourceSampleId), [1, 3, 4]);
  assert.equal(analysis.workspace, null);
  assert.equal(analysis.run.importedColumns[1].name, '=압력/온도, "비율"');
  assert.equal(analysis.samples[0].importedValues['data-calc-divide'].value, null);
  assert.match(analysis.samples[0].importedValues['data-calc-divide'].reason, /0으로/);
  assert.equal(analysis.samples[1].importedValues['data-calc-divide'].value, 503);
  const dashboard = parseExperimentCsv(await fixture('dashboard-default.csv'), options);
  assert.equal(dashboard.samples[0].values.x, 0); assert.equal(dashboard.samples[0].values.y, -12.5);
  assert.equal(dashboard.samples[0].values.strength, 12.91559135308949);
  assert.ok(dashboard.samples[1].receivedAt < dashboard.samples[0].receivedAt);
});

test('generic CSV exports follow analysis scope, retain metadata and reasons, and escape only string formulas', async () => {
  const snapshot = parseExperimentJson(legacy2), before = structuredClone(snapshot);
  const imported = parseExperimentCsv(buildAnalysisCsv(snapshot), options);
  assert.deepEqual(imported.samples.map(s => s.sourceSampleId), [1, 3, 4]);
  assert.equal(imported.samples[1].importedValues['data-calc-kelvin'].value, 275.15);
  assert.equal(imported.workspace, null);
  const again = parseExperimentCsv(buildCsv(imported), options);
  assert.deepEqual(again.samples, imported.samples); assert.deepEqual(again.run.importedColumns, imported.run.importedColumns);
  const dashboard = parseExperimentCsv(await fixture('dashboard-default.csv'), options), csv = buildCsv(dashboard);
  assert.match(csv, /-12\.5/); assert.doesNotMatch(csv, /'-12\.5/);
  assert.deepEqual(snapshot, before);
});

test('analysis CSV cannot export more fixed columns than the importer can restore; full JSON keeps all formulas', () => {
  const snapshot = parseExperimentJson(legacy2);
  snapshot.workspace.calculatedColumns = Array.from({ length: 15 }, (_, i) => ({ id: `calc-extra-${i}`, name: `계산 ${i}`, unit: null,
    lhs: { kind: 'column', columnId: 'temperatureC' }, op: '+', rhs: { kind: 'constant', value: i } }));
  assert.throws(() => buildAnalysisCsv(snapshot), /16개 이하/);
  assert.equal(parseExperimentJson(buildExperimentJson(snapshot)).workspace.calculatedColumns.length, 15);
  const allowed = snapshot.workspace.calculatedColumns.slice(0, 14).map(c => c.id);
  assert.equal(parseExperimentCsv(buildAnalysisCsv(snapshot, allowed), options).run.importedColumns.length, 14);
});

test('unknown CSV requires confirmed column mapping with real timestamps and explicit units; bad rows fail as a whole', () => {
  const text = 'when,reading\n2026-10-12T10:00:00Z,-2.5';
  assert.throws(() => parseExperimentCsv(text, options), e => e.code === 'CSV_MAPPING_REQUIRED' && e.headers.includes('reading'));
  assert.throws(() => parseExperimentCsv('timestamp,temperature_c,pressure_hpa\n2026-10-12T10:00:00Z,20,1000', options),
    e => e.code === 'CSV_MAPPING_REQUIRED');
  const mapping = { confirmed: true, timestamp: 'when', columns: [{ header: 'reading', id: 'voltage', name: '전압', unit: 'V' }] };
  const imported = parseExperimentCsv(text, { ...options, mapping });
  assert.equal(imported.samples[0].values.voltage, -2.5); assert.equal(imported.run.context.channels[0].unit, 'V');
  for (const bad of [text.replace('10:00:00Z', '10:00:00'),
    text.replace('2026-10-12', '2026-02-30'), text.replace('-2.5', 'Infinity'), text + '\n2026-10-12T10:00:01Z,0xff', text + ',oops'])
    assert.throws(() => parseExperimentCsv(bad, { ...options, mapping }), /CSV/);
  assert.throws(() => parseExperimentCsv(text, { ...options, mapping: { ...mapping, confirmed: false } }), e => e.code === 'CSV_MAPPING_REQUIRED');
});

test('CSV without time remains explicitly undated through JSON and CSV roundtrips', () => {
  const mapping = { confirmed: true, timestamp: null, columns: [{ header: 'volts', id: 'voltage', name: '전압', unit: 'V' }] };
  const imported = parseExperimentCsv('volts\n0\n-2.5', { ...options, mapping });
  assert.deepEqual(imported.samples.map(s => s.receivedAt), [null, null]);
  assert.equal(imported.run.csvImport.missingTimestamps, true);
  assert.equal(imported.run.context.defaultGraph.xColumnId, 'sampleId');
  const csv = buildCsv(imported), restored = parseExperimentCsv(csv, options);
  assert.doesNotMatch(csv, /1970-01-01/);
  assert.deepEqual(restored.samples.map(s => s.receivedAt), [null, null]);
  assert.deepEqual(parseExperimentJson(buildExperimentJson(imported)), imported);
});


test('JSON roundtrip preserves optional right Y and fixed evidence while recomputing its fit from source', () => {
  const snapshot=parseExperimentJson(legacy2);
  const store={getSnapshot:()=>structuredClone(snapshot),getState:()=>({writable:true}),saveWorkspace:value=>{snapshot.workspace=structuredClone(value);}};
  const w=createWorkspace({store});
  w.setRightAxis({yColumnId:'calc-kelvin',trendEnabled:true,view:'extended'}); w.captureReflection();
  const expectedModel=w.getGraphData(), expectedEvidence=w.getReflectionModel();
  const restored=parseExperimentJson(buildExperimentJson(snapshot)), reopened=open(restored);
  assert.deepEqual(restored.workspace.graph.right,snapshot.workspace.graph.right);
  assert.deepEqual(reopened.getGraphData(),expectedModel);
  assert.deepEqual(reopened.getReflectionModel(),expectedEvidence);
  assert.deepEqual(restored.samples,snapshot.samples);
  const bad=structuredClone(restored);bad.workspace.graph.right.yColumnId='gone';
  assert.throws(()=>validateExperimentSnapshot(bad),/오른쪽 세로축/);
  const badEvidence=structuredClone(restored);badEvidence.workspace.reflection.evidence.graph.right.yColumnId='gone';
  assert.throws(()=>validateExperimentSnapshot(badEvidence),/오른쪽 세로축/);
});
