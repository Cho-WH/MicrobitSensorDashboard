// Adapted from Cho-WH/bme280 gay-lussac/analysis/workspace.js at 59c5c149450f970bace2deaa183857c275595853.
import { DEFAULT_FILTER, tableRows, analysisScope, normalizeFilter, columnRanges } from './table-data.js';
import { validateCalculatedColumns, validateGraph, validateImportedColumns } from '../domain/contracts.js';
import { rangeSampleIds, validateAnalysisRange, timeBounds, timeOrigin } from './scope.js';
import { createCalculator, presetColumns } from './calculations.js';
import { graphData } from './graph-data.js';
import { fitGraph, trendGeometry, graphWithTrends } from './regression.js';
import { captureEvidence, evidenceKey, evidenceGraph, validateAnswers, validateReflection, REFLECTION_QUESTIONS } from './reflection.js';

import { getSourceColumns, readCell } from '../domain/columns.js';
import { pointSourceRows } from './data-source.js';
import { supportsCentripetal, blankBook, activeSheet, editCentripetal, validateCentripetal, validateCentripetalContext, intervalModel, calculationModel } from './activities/centripetal.js';

const copy = structuredClone;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const orderedIds = ids => [...new Set(ids)].sort((a, b) => a - b);
const historyState = state => ({ appliedIds: state.appliedIds, appliedScope: state.appliedScope, analysisRange: state.analysisRange, exclusions: state.exclusions, calculatedColumns: state.calculatedColumns, graph: state.graph,
  regression: { enabled: state.regression?.enabled === true }, centripetal: state.centripetal ?? null });
const inputState = state => {
  const applied = new Set(state.appliedIds);
  const byId = new Map(state.calculatedColumns.map(c => [c.id, c])), needed = new Set();
  function visit(id) {
    if (needed.has(id) || !byId.has(id)) return;
    needed.add(id);
    for (const operand of [byId.get(id).lhs, byId.get(id).rhs]) if (operand.kind === 'column') visit(operand.columnId);
  }
  (state.graph ? [state.graph.xColumnId, state.graph.yColumnId, state.graph.right?.yColumnId] : [...byId.keys()]).forEach(visit);
  return { axes: state.graph ? [state.graph.xColumnId, state.graph.yColumnId, state.graph.right?.yColumnId] : null,
    calculations: state.calculatedColumns.filter(c => needed.has(c.id)).map(({ id, lhs, op, rhs }) => ({ id, lhs, op, rhs })),
    inputSnapshot: state.inputSnapshot,
    appliedIds: state.appliedIds, excludedIds: state.exclusions.filter(e => applied.has(e.sampleId)).map(e => e.sampleId) };
};

// Owns editable definitions; samples are a read-only projection from RunStore snapshots.
// Every change is copied into RunStore immediately. Only the database write is delayed.
/** @param {{store:any, context?:any, sourceId?:'recorded'|'points'}} options */
export function createWorkspace({ store, context: suppliedContext, sourceId = store.getRun?.().recordingMode === 'point' ? 'points' : 'recorded' }) {
  const snapshot = store.getSnapshot();
  const savedWorkspace = snapshot.workspace?.bySource[sourceId];
  const initial = sourceId === 'points' ? store.getAnalysisSourceSnapshot('points') : null;
  let rawSamples = snapshot.samples;
  const input = savedWorkspace?.inputSnapshot ?? initial?.inputSnapshot;
  let samples = input ? pointSourceRows(rawSamples, input) : rawSamples;
  const getTimeOrigin = (_source = samples) => timeOrigin(rawSamples, snapshot.run);
  const baseContext = suppliedContext ?? snapshot.run.context;
  let context = input ? {...baseContext, analysisSource: 'points', manualColumns: input.manualColumns} : baseContext;
  validateCentripetalContext(context);
  let sourceColumns = getSourceColumns(context);
  const defaultGraph = validateGraph(sourceId === 'points' ? {
    xColumnId: input.manualColumns[0]?.id ?? (samples.some(s => Number.isFinite(s.receivedAt)) ? 'receivedAt' : 'sampleId'),
    yColumnId: context.defaultGraph?.yColumnId ?? context.channels.find(c => c.graphable !== false && c.supported !== false)?.id,
    type: 'scatter', connectGaps: false, view: 'measured',
  } : context?.defaultGraph ?? {
    xColumnId: 'receivedAt', yColumnId: sourceColumns.find(c => c.calculable && c.supported !== false)?.id,
    type: 'line', connectGaps: false, view: 'measured',
  }, [], [], context);
  const calculationTemplates = context?.analysisTemplates ?? context?.activity?.analysisTemplates ?? [];
  const questions = context?.questions ?? context?.activity?.questions ?? REFLECTION_QUESTIONS;
  const imported = validateImportedColumns(snapshot.run.importedColumns ?? [], context);
  const writable = store.getState().writable;
  const initialIds = samples.filter(s => !s.withdrawn).map(s => s.sampleId);
  let state = savedWorkspace ? copy(savedWorkspace) : {
    runId: snapshot.run.id, workspaceRevision: 0, analysisInputRevision: 0,
    tableLastSampleId: rawSamples.at(-1)?.sampleId ?? 0,
    appliedThroughSampleId: rawSamples.at(-1)?.sampleId ?? 0,
    ...(input ? {inputSnapshot: copy(input)} : {}),
    table: { sort: { columnId: 'sampleId', direction: 'asc' }, filter: { ...DEFAULT_FILTER } },
    selectedIds: [], appliedIds: initialIds, appliedScope: 'all', exclusions: [],
    calculatedColumns: [], graph: sourceId === 'points' ? copy(defaultGraph) : null, regression: null, note: '',
  };
  if(state.centripetal)state.centripetal=validateCentripetal(state.centripetal,rawSamples,context,state.tableLastSampleId);
  if (!state.centripetal && supportsCentripetal(context)) {
    state.centripetal = blankBook();
    const radius = context.setup?.centripetalRadiusM;
    if (typeof radius === 'string' && radius.length <= 80) {
      state.centripetal.sheets[0].inputs.radius = radius;
      if (radius) state.centripetal.sheets[0].sources.radius = 'manual';
    }
  }
  // Ignore legacy scroll positions; scrolling belongs only to the live table view.
  delete state.table.scrollTop;
  state.appliedThroughSampleId ??= state.tableLastSampleId;
  state.calculatedColumns = validateCalculatedColumns(state.calculatedColumns ?? [], imported, context);
  state.graph = validateGraph(state.graph, state.calculatedColumns, imported, context);
  state.regression = { enabled: state.regression?.enabled === true };
  state.analysisRange = validateAnalysisRange(state.analysisRange, samples, state);
  // RunStore/file validation already checks point evidence against its own frozen input.
  if (sourceId !== 'points' || !state.reflection) state.reflection = validateReflection(state.reflection, samples, imported, context);
  delete state.interpretation;
  state.table.filter = normalizeFilter(state.table.filter, [...imported, ...state.calculatedColumns], context);
  if (state.table.sort.columnId === 'segmentId') state.table.sort = { columnId: 'sampleId', direction: 'asc' };
  const undo = [], redo = [];
  let loadedCount = samples.filter(s => s.sampleId <= state.tableLastSampleId).length;
  let anchorId = null;
  let projection = null;
  let reflectionCache = null;
  function projected(next = state, source = samples) {
    const key = JSON.stringify(next.calculatedColumns);
    if (projection?.samples !== source || projection.key !== key) {
      const calculate = createCalculator(next.calculatedColumns, imported, context);
      projection = { samples: source, key, rows: next.calculatedColumns.length
        ? source.map(s => ({ ...s, calculations: calculate(s) })) : source };
    }
    return projection.rows;
  }
  const rowsFor = (next = state) => tableRows(projected(next), next, context);
  function assertWriter() { if (!writable) throw new Error('다른 탭에서 작성 중인 실험은 읽기 전용이에요.'); }
  function updateRegression(next, source = samples, force = false) {
    if (next.graph?.right?.view === 'extended') {
      const right = graphData(projected(next, source), next, imported, context, getTimeOrigin(source)).right;
      if (!right.trendEnabled || !trendGeometry(fitGraph(right, next.analysisInputRevision), true).intercept.length) next.graph.right.view = 'measured';
    }
    if (!next.graph || !next.regression?.enabled) {
      next.regression = { enabled: false };
      if (next.graph) next.graph.view = 'measured';
      return;
    }
    if (force || next.regression.inputRevision !== next.analysisInputRevision || !next.regression.result)
      next.regression = fitGraph(graphData(projected(next, source), next, imported, context, getTimeOrigin(source)), next.analysisInputRevision);
    if (next.graph.view === 'extended' && !trendGeometry(next.regression, true).intercept.length) next.graph.view = 'measured';
  }
  // Derived numbers from older saves are never trusted as current results.
  updateRegression(state, samples, true);
  function commit(next, label = null, source = samples) {
    assertWriter();
    if (same(state, next)) return false;
    const inputChanged = !same(inputState(state), inputState(next));
    next.workspaceRevision = state.workspaceRevision + 1;
    next.analysisInputRevision = state.analysisInputRevision + Number(inputChanged);
    updateRegression(next, source);
    store.saveWorkspace(sourceId, copy(next));
    if (label && !same(historyState(state), historyState(next))) {
      undo.push({ label, before: copy(historyState(state)), after: copy(historyState(next)) }); redo.length = 0;
    }
    state = next;
    return true;
  }
  if (!savedWorkspace && writable) {
    state.workspaceRevision = 1;
    store.saveWorkspace(sourceId, copy(state));
  }
  function loadedIds() { return samples.filter(s => s.sampleId <= state.tableLastSampleId).map(s => s.sampleId); }
  function activeIds(through = state.appliedThroughSampleId) { return samples.filter(s => s.sampleId <= through && !s.withdrawn).map(s => s.sampleId); }
  // Older workspaces could keep a partial candidate set even in 'all' mode.
  // Preserve those inputs as a designated analysis instead of expanding them on open.
  if (savedWorkspace && state.appliedScope === 'all' && !same(orderedIds(state.appliedIds), orderedIds(activeIds()))) {
    const next = { ...copy(state), appliedScope: 'selection' };
    if (writable) commit(next); else state = next;
  }
  function validateIds(ids) {
    const allowed = new Set(loadedIds());
    if (ids.some(id => !allowed.has(id))) throw new Error('먼저 새 자료 반영을 눌러 표에 자료를 불러오세요.');
    return orderedIds(ids);
  }
  function setSelection(ids) { return commit({ ...copy(state), selectedIds: validateIds(ids) }); }
  function selectRange(min, max) {
    if (![min, max].every(v => Number.isSafeInteger(v) && v >= 1) || min > max || max > state.tableLastSampleId)
      throw new Error('표에 불러온 자료 ID 안에서 시작과 끝을 입력하세요.');
    const changed = setSelection(rowsFor().filter(s => s.sampleId >= min && s.sampleId <= max).map(s => s.sampleId));
    anchorId = null;
    return changed;
  }
  function toggleSelection(id, { extend = false, checked = !state.selectedIds.includes(id) } = {}) {
    const ids = rowsFor().map(s => s.sampleId);
    const end = ids.indexOf(id), start = extend ? ids.indexOf(anchorId) : -1;
    if (end < 0) return false;
    const target = start < 0 ? [id] : ids.slice(Math.min(start, end), Math.max(start, end) + 1);
    const selected = new Set(state.selectedIds);
    target.forEach(value => checked ? selected.add(value) : selected.delete(value));
    if (!extend || start < 0) anchorId = id;
    return setSelection([...selected]);
  }
  function command(next, label) {
    // Persist the action and its cleared checkboxes together. A failed save changes neither.
    const changed = commit({ ...next, selectedIds: [] }, label);
    anchorId = null;
    return changed;
  }
  function applyScope(mode) {
    if (!['selection', 'all'].includes(mode)) throw new Error('분석 범위를 확인하세요.');
    const ids = mode === 'selection' ? state.selectedIds : activeIds();
    if (!ids.length && mode === 'selection') throw new Error('분석할 행을 먼저 선택하세요.');
    return command({ ...copy(state), appliedIds: orderedIds(ids), appliedScope: mode, analysisRange: null,
      appliedThroughSampleId: ids.reduce((max,id) => Math.max(max,id), state.appliedThroughSampleId) }, mode === 'selection' ? '지정 분석' : '전체 자료 분석');
  }
  function applyTimeRange(range) {
    const loaded = samples.filter(s => s.sampleId <= state.tableLastSampleId);
    const ids = rangeSampleIds(loaded, range), bounds = timeBounds(loaded);
    if (!ids.length) throw new Error('선택한 구간에 자료가 없어요. 시간을 다시 골라 주세요.');
    if (range.startAt < bounds.startAt || range.endAt > bounds.endAt) throw new Error('불러온 자료의 시간 안에서 구간을 골라 주세요.');
    return command({ ...copy(state), appliedIds: orderedIds(ids), appliedScope: 'selection', appliedThroughSampleId: state.tableLastSampleId,
      analysisRange: { startAt: range.startAt, endAt: range.endAt, throughSampleId: state.tableLastSampleId } }, '분석 구간 변경');
  }
  function exclude(ids, reason = '') {
    const target = validateIds(ids);
    if (!target.length) throw new Error('제외할 행을 먼저 선택하세요.');
    const entries = new Map(state.exclusions.map(e => [e.sampleId, e]));
    target.forEach(sampleId => {
      if (!entries.has(sampleId)) entries.set(sampleId, { sampleId, reason: reason.trim().slice(0, 200) });
    });
    return command({ ...copy(state), exclusions: [...entries.values()].sort((a, b) => a.sampleId - b.sampleId) }, '자료 제외');
  }
  function restore(ids) {
    const target = new Set(validateIds(ids));
    return command({ ...copy(state), exclusions: state.exclusions.filter(e => !target.has(e.sampleId)) }, '제외 해제');
  }
  function setFilter(filter) {
    const f = normalizeFilter(filter, [...imported, ...state.calculatedColumns], context);
    const changed = commit({ ...copy(state), selectedIds: [], table: { ...copy(state.table), filter: copy(f) } });
    anchorId = null;
    return changed;
  }
  function setSort(columnId) {
    if (![...sourceColumns, ...imported, ...state.calculatedColumns].some(c => c.id === columnId)) throw new Error('정렬할 열이 없어요.');
    const direction = state.table.sort.columnId === columnId && state.table.sort.direction === 'asc' ? 'desc' : 'asc';
    return commit({ ...copy(state), table: { ...copy(state.table), sort: { columnId, direction } } });
  }
  function showNewData() {
    assertWriter();
    const next = store.getSnapshot();
    if (next.run.id !== state.runId) throw new Error('열린 실험이 바뀌었어요.');
    const source = sourceId === 'points' ? store.getAnalysisSourceSnapshot('points') : null;
    const rows = source?.rows ?? next.samples, boundary = next.samples.at(-1)?.sampleId ?? 0;
    const oldContext = context;
    context = source ? {...baseContext, analysisSource: 'points', manualColumns: source.inputSnapshot.manualColumns} : baseContext;
    sourceColumns = getSourceColumns(context);
    try {
      const changed = commit({ ...copy(state), tableLastSampleId: boundary, appliedThroughSampleId: boundary,
        ...(source ? {inputSnapshot: source.inputSnapshot} : {}),
        appliedIds: state.appliedScope === 'all' ? rows.filter(s => !s.withdrawn).map(s => s.sampleId) : state.appliedIds }, null, rows);
      samples = rows; rawSamples = next.samples; loadedCount = samples.length;
      return changed;
    } catch (error) { context = oldContext; sourceColumns = getSourceColumns(context); projection = null; throw error; }
  }
  function pendingChanges() {
    if (sourceId !== 'points') return {added: Math.max(0, store.getState().sampleCount - state.appliedThroughSampleId), changed: 0, definitions: false};
    const previous = state.inputSnapshot;
    if (store.getState().pointDataRevision === previous.sourceRevision) return {added:0, changed:0, definitions:false};
    const current = {points:store.getPointRecords(), manualColumns:store.getRun().manualColumns};
    const old = new Map(previous.points.map(p => [p.pointRecordId, p]));
    const definitions = !same(current.manualColumns, previous.manualColumns);
    return {added: current.points.filter(p => !old.has(p.pointRecordId)).length,
      changed: current.points.filter(p => old.has(p.pointRecordId) && (definitions || !same(p.manualValues, old.get(p.pointRecordId).manualValues) || p.withdrawn !== old.get(p.pointRecordId).withdrawn)).length, definitions};
  }
  function revealSample(sampleId) {
    if (sourceId !== 'recorded') throw new Error('연속 기록에서 원래 시점을 확인하세요.');
    const next = store.getSnapshot();
    if (!next.samples.some(s => s.sampleId === sampleId)) throw new Error('연결된 원자료를 찾지 못했어요.');
    if (sampleId <= state.tableLastSampleId) return;
    const draft = {...copy(state), tableLastSampleId: sampleId};
    if (writable) commit(draft, null, next.samples); else state = draft;
    rawSamples = samples = next.samples; loadedCount = samples.filter(s => s.sampleId <= sampleId).length;
  }
  function replaceColumns(definitions, label) {
    const next = { ...copy(state), calculatedColumns: validateCalculatedColumns(definitions, imported, context) };
    reconcileTableColumns(next);
    const visible = new Set(rowsFor(next).map(s => s.sampleId));
    next.selectedIds = next.selectedIds.filter(id => visible.has(id));
    return commit(next, label);
  }
  function columnDraft(definition, prerequisites = []) {
    const index = state.calculatedColumns.findIndex(c => c.id === definition.id);
    const columns = copy(state.calculatedColumns);
    const pending = new Map(prerequisites.map(c => [c.id, c])), needed = new Set();
    function visit(c) {
      for (const operand of [c.lhs, c.rhs]) {
        if (operand?.kind !== 'column' || !pending.has(operand.columnId) || needed.has(operand.columnId)) continue;
        needed.add(operand.columnId); visit(pending.get(operand.columnId));
      }
    }
    visit(definition);
    // Unused template helpers disappear with the draft, never becoming orphan columns.
    columns.push(...prerequisites.filter(c => needed.has(c.id)));
    if (index < 0) columns.push(definition); else columns[index] = definition;
    return columns;
  }
  function saveColumn(definition, prerequisites = []) {
    const existing = state.calculatedColumns.some(c => c.id === definition.id);
    return replaceColumns(columnDraft(definition, prerequisites), existing ? '계산 열 편집' : '계산 열 추가');
  }
  function columnUsers(id) {
    const users = state.calculatedColumns.filter(c => [c.lhs, c.rhs].some(o => o.kind === 'column' && o.columnId === id)).map(c => c.name);
    if ([state.graph?.xColumnId, state.graph?.yColumnId, state.graph?.right?.yColumnId].includes(id)) users.push('그래프 축');
    const range = columnRanges(state.table.filter)[id];
    if (range && (range.min != null || range.max != null)) users.push('이 열의 필터');
    if (state.table.sort.columnId === id) users.push('이 열의 정렬');
    return users;
  }
  function deleteColumn(id) {
    if (!state.calculatedColumns.some(c => c.id === id)) throw new Error('삭제할 계산 열이 없습니다.');
    const users = columnUsers(id);
    if (users.length) throw new Error('먼저 사용 중인 항목을 변경하거나 해제하세요: ' + users.join(', '));
    return replaceColumns(state.calculatedColumns.filter(c => c.id !== id), '계산 열 삭제');
  }
  function previewColumn(definition, prerequisites = []) {
    const calculate = createCalculator(columnDraft(definition, prerequisites), imported, context);
    const ids = new Set(state.appliedIds), excluded = new Set(state.exclusions.map(e => e.sampleId));
    return samples.filter(s => ids.has(s.sampleId) && !excluded.has(s.sampleId)).slice(0, 3)
      .map(s => {
        const values = calculate(s);
        const inputs = [definition.lhs, definition.rhs].map(o => o.kind === 'constant' ? { value: o.value, reason: null }
          : values[o.columnId] ?? readCell(s, o.columnId));
        return { sampleId: s.sampleId, ...values[definition.id], inputs };
      });
  }
  function reconcileTableColumns(next) {
    // Keep live table settings, removing only references to absent calculated columns.
    const available = new Set([...sourceColumns, ...imported, ...next.calculatedColumns].map(c => c.id));
    const ranges = columnRanges(next.table.filter), removed = Object.keys(ranges).filter(id => !available.has(id));
    if (removed.length || !available.has(next.table.filter.columnId)) {
      removed.forEach(id => delete ranges[id]);
      next.table.filter = { ...next.table.filter, columnId: 'sampleId', min: null, max: null, ranges };
    }
    if (!available.has(next.table.sort.columnId)) next.table.sort = { columnId: 'sampleId', direction: 'asc' };
  }
  function travel(from, to, direction) {
    assertWriter();
    const item = from.at(-1);
    if (!item) return false;
    const next = { ...copy(state), ...copy(item[direction]) };
    if (next.appliedScope === 'all') next.appliedIds = activeIds();
    reconcileTableColumns(next);
    // Undoing a status change can hide checked rows under the current status filter.
    const visible = new Set(rowsFor(next).map(s => s.sampleId));
    next.selectedIds = next.selectedIds.filter(id => visible.has(id));
    commit(next);
    anchorId = null;
    from.pop(); to.push(item); return true;
  }
  function getGraphData() {
    const graph = state.graph ?? defaultGraph;
    const model = graphData(projected(), { ...state, graph }, imported, context, getTimeOrigin()), regression = state.regression;
    return graphWithTrends(model,copy(regression));
  }
  function getReflectionModel() {
    const evidence = state.reflection.evidence, key = evidenceKey(evidence);
    if (!evidence) return null;
    if (reflectionCache?.key !== key) reflectionCache = { key, model: evidenceGraph(rawSamples, evidence, imported, baseContext, getTimeOrigin()) };
    return copy(reflectionCache.model);
  }
  function captureReflection() {
    assertWriter();
    const model=getGraphData();
    if (!model.points.length&&!model.right?.points.length) throw new Error('그래프에 표시할 자료를 먼저 확인해 주세요.');
    return commit({ ...copy(state), reflection: { ...copy(state.reflection), evidence: captureEvidence(state, defaultGraph) } });
  }

  let activityCache = null;
  function getCentripetalModel(frozen = false, sheetId = null) {
    if (!supportsCentripetal(context)) return null;
    const book = state.centripetal ?? blankBook();
    const sheet = frozen ? book.evidence?.sheet : book.sheets.find(sheet=>sheet.id===sheetId) ?? activeSheet(book);
    if (!sheet) return null;
    const exclusions = frozen ? book.evidence.excludedIds : state.exclusions;
    const key = JSON.stringify([sheet.startId,sheet.endId,exclusions,state.tableLastSampleId,store.getState().eventsVersion]);
    if (activityCache?.key !== key) activityCache = {key, interval: intervalModel(sheet,
      rawSamples.filter(s=>s.sampleId<=state.tableLastSampleId), store.getEvents(Infinity), exclusions)};
    const interval = structuredClone(activityCache.interval);
    return {book:structuredClone(book), sheet:structuredClone(sheet), interval, ...calculationModel(sheet,interval)};
  }
  function editActivity(action) {
    if (!supportsCentripetal(context)) throw new Error('구심가속도 활동의 연속 기록에서 사용하세요.');
    if (action.type === 'mean' && !Number.isFinite(getCentripetalModel().interval.mean)) throw new Error('평균을 구할 수 있는 연속 구간을 선택하세요.');
    if(action.type==='range'){
      const ends=['startId','endId'].map(key=>rawSamples.find(s=>s.sampleId===action[key]&&s.sampleId<=state.tableLastSampleId));
      if(ends.some(s=>!s||readCell(s,'magneticStrength').reason))throw new Error('구간 양 끝의 자기장값이 유효하지 않아요. 다른 구간을 선택하세요.');
      if(!(ends[1].sampleId>ends[0].sampleId&&ends[1].receivedAt>ends[0].receivedAt))throw new Error('서로 다른 두 표본을 포함하는 구간을 선택하세요.');
    }
    if (action.type === 'endpoint') {
      const sample = rawSamples.find(s=>s.sampleId===action.sampleId && s.sampleId<=state.tableLastSampleId);
      if (!sample || readCell(sample,'magneticStrength').reason) throw new Error('유효한 자기장 원자료 표본을 선택하세요.');
    }
    const next = editCentripetal(state.centripetal,action);
    const validated = validateCentripetal(next,rawSamples,context,state.tableLastSampleId);
    return commit({...copy(state),centripetal:validated},'활동지 변경');
  }
  function captureActivity() {
    const model = getCentripetalModel();
    if (!model) throw new Error('활동지를 먼저 여세요.');
    if (!model.comparisonReady) throw new Error('두 구심가속도를 입력하고 바뀐 조건의 계산을 확인해 주세요.');
    if (model.interval.problem) throw new Error(model.interval.problem);
    const book = model.book;
    book.evidence = {sheet:copy(model.sheet),capturedAt:Date.now(),policy:'linear-time-v1',excludedIds:state.exclusions.map(e=>e.sampleId)};
    return commit({...copy(state),centripetal:book},'활동지 근거 보관');
  }

  return {
    getCentripetalModel, editActivity, captureActivity,
    getState: () => ({ ...copy(state), sourceId, sourceColumns: copy(sourceColumns), channels: copy(context?.channels ?? []), context: copy(context), calculationTemplates: copy(calculationTemplates), questions: copy(questions), defaultGraph: copy(defaultGraph) }), isWritable: () => writable, getLoadedCount: () => loadedCount,
    pendingChanges, revealSample,
    syncExplicitChanges() {
      const saved = store.getState();
      if (!writable || !saved.writable) return false;
      // Point revisions represent confirmed edits/captures. Streaming samples
      // remain pending until explicitly applied or recording is finished.
      const ready = sourceId === 'points'
        ? saved.pointDataRevision !== state.inputSnapshot.sourceRevision
        : saved.runStatus === 'complete' && saved.sampleCount > state.appliedThroughSampleId;
      return ready ? showNewData() : false;
    },
    getRows: () => copy(rowsFor()),
    getImportedColumns: () => copy(imported), getSourceColumns: () => copy(sourceColumns),
    getSamples: () => copy(projected().filter(s => s.sampleId <= state.tableLastSampleId)),
    getGraphData, getReflectionModel, captureReflection, getTimeOrigin,
    reflectionChanged: () => Boolean(state.reflection.evidence) && evidenceKey(state.reflection.evidence) !== evidenceKey(captureEvidence(state, defaultGraph)),
    setReflectionAnswers(answers) { return commit({ ...copy(state), reflection: { ...copy(state.reflection), answers: validateAnswers(answers, questions) } }); },
    getSummary() {
      const rows = rowsFor(), selected = new Set(state.selectedIds);
      return { ...analysisScope(samples, state, context), loadedCount,
        selectedCount: selected.size, visibleSelectedCount: rows.filter(s => selected.has(s.sampleId)).length,
        undoLabel: undo.at(-1)?.label ?? '', redoLabel: redo.at(-1)?.label ?? '' };
    },
    setSelection, selectRange, toggleSelection, applyScope, applyTimeRange, exclude, restore, setFilter, setSort, showNewData,
    saveColumn, deleteColumn, columnUsers, previewColumn,
    setGraph(graph) { return commit({ ...copy(state), graph: validateGraph({ ...graph, view: state.graph?.view }, state.calculatedColumns, imported, context) }, state.graph ? '그래프 변경' : '그래프 만들기'); },
    setRightAxis(right) {
      const graph=validateGraph({...copy(state.graph??defaultGraph),right},state.calculatedColumns,imported,context);
      return commit({...copy(state),graph},right?'오른쪽 세로축 변경':'오른쪽 세로축 제거');
    },
    setTrendEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new Error('추세선 표시 상태를 확인하세요.');
      return commit({ ...copy(state), graph: copy(state.graph ?? defaultGraph), regression: enabled === state.regression.enabled ? copy(state.regression) : { enabled } }, '추세선 표시 변경');
    },
    setGraphView(view) {
      if (!state.graph || !['measured', 'extended'].includes(view)) throw new Error('그래프 보기 범위를 확인하세요.');
      if (view === 'extended' && !trendGeometry(state.regression, true).intercept.length) throw new Error('현재 추세선의 x절편을 계산할 수 없어요.');
      return commit({ ...copy(state), graph: { ...state.graph, view } }, '그래프 보기 범위 변경');
    },
    preparePreset(kind) { return presetColumns(kind, state.calculatedColumns, undefined, calculationTemplates); },
    selectAll() { return setSelection(rowsFor().map(s => s.sampleId)); },
    clearSelection() { anchorId = null; return setSelection([]); },
    undo: () => travel(undo, redo, 'before'), redo: () => travel(redo, undo, 'after'),
  };
}
