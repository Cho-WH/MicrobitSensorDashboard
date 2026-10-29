// Adapted from Cho-WH/bme280 gay-lussac/data/import-validation.js, 59c5c149450f970bace2deaa183857c275595853.
// Validate complete files before opening a Run or starting any database transaction.
import { validateCalculatedColumns, validateGraph, validateImportedColumns, validateChannels, validateSample, isExperimentMemo, EXPERIMENT_FILE_VERSION } from '../../domain/contracts.js';
import { validateManualColumns, validatePointRecord, validatePointInput } from '../../domain/point-records.js';
import { upgradeRun, upgradeWorkspace } from '../schema.js';
import { pointSourceRows } from '../../analysis/data-source.js';
import { getSourceColumns } from '../../domain/columns.js';
import { LIMITS } from '../../domain/limits.js';
import { normalizeFilter } from '../../analysis/table-data.js';
import { validateAnalysisRange } from '../../analysis/scope.js';
import { validateReflection, REFLECTION_QUESTIONS } from '../../analysis/reflection.js';

export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => Number.isFinite(value) && Math.abs(value) <= 8640000000000000;
const string = value => typeof value === 'string' && value.length > 0;
export function requireValue(ok, message, code = 'INVALID_EXPERIMENT') {
  if (!ok) throw Object.assign(new Error('실험 파일: ' + message), { code });
}
export function byteLength(value) { return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength; }
export function checkFileSize(text) {
  requireValue(typeof text === 'string', '파일 내용을 읽지 못했어요.');
  requireValue(byteLength(text) <= LIMITS.maxFileBytes, '파일은 32 MiB 이하여야 합니다.', 'FILE_TOO_LARGE');
}
export function checkJson(value, depth = 0) {
  requireValue(depth < 40, '중첩된 자료가 너무 깊습니다.');
  if (typeof value === 'number') requireValue(Number.isFinite(value), '유한하지 않은 숫자가 있습니다.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), '지원하지 않는 속성이 있습니다.');
    checkJson(child, depth + 1);
  }
}

// These are display data, never a source of executable device or activity policies.
function validateContextContent(context, imported) {
  const expectedQuestionIds = new Set(REFLECTION_QUESTIONS.map(q => q.id));
  const textArray = value => Array.isArray(value) && value.every(item => typeof item === 'string');
  for (const owner of [context, context.sensor, context.activity].filter(Boolean)) {
    if (owner.name != null) requireValue(typeof owner.name === 'string', '센서·활동 이름은 문자열이어야 합니다.');
    if (owner.preparation != null) requireValue(textArray(owner.preparation), '준비 안내는 문장 목록이어야 합니다.');
    if (owner.questions != null) {
      requireValue(Array.isArray(owner.questions) && owner.questions.length === expectedQuestionIds.size
        && new Set(owner.questions.map(q => q?.id)).size === expectedQuestionIds.size
        && owner.questions.every(q => object(q) && expectedQuestionIds.has(q.id)
          && string(q.title) && string(q.question)), '해석 질문의 ID·제목·안내를 확인하세요.');
    }
    if (owner.analysisTemplates != null) {
      requireValue(Array.isArray(owner.analysisTemplates)
        && new Set(owner.analysisTemplates.map(t => t?.id)).size === owner.analysisTemplates.length, '계산 예시 목록의 ID를 확인하세요.');
      for (const template of owner.analysisTemplates) {
        requireValue(object(template) && string(template.id) && string(template.name)
          && Array.isArray(template.columns) && template.columns.length > 0, '계산 예시의 이름·수식을 확인하세요.');
        validateCalculatedColumns(template.columns, imported, context);
      }
    }
    if (owner.defaultGraph != null) validateGraph(owner.defaultGraph, [], imported, context);
  }
  if (context.activity?.memoPresets != null) {
    const presets = context.activity.memoPresets;
    requireValue(Array.isArray(presets) && new Set(presets.map(item => item?.id)).size === presets.length
      && presets.every(item => object(item) && string(item.id) && string(item.text) && item.text.length <= 500), '빠른 메모의 이름·내용을 확인하세요.');
  }
  for (const channel of context.channels) {
    if (channel.digits != null) requireValue(Number.isInteger(channel.digits) && channel.digits >= 0 && channel.digits <= 20, '측정값의 표시 자릿수는 0~20이어야 합니다.');
    for (const flag of ['supported', 'calculable', 'graphable']) if (channel[flag] != null)
      requireValue(typeof channel[flag] === 'boolean', '측정 항목의 사용 설정을 확인하세요.');
    for (const key of ['color', 'quantity']) if (channel[key] != null)
      requireValue(typeof channel[key] === 'string', '측정 항목의 표시 정보를 확인하세요.');
    for (const key of ['min', 'max']) if (channel[key] != null)
      requireValue(Number.isFinite(channel[key]), '측정 범위는 유한한 숫자여야 합니다.');
    requireValue(channel.min == null || channel.max == null || channel.min <= channel.max, '측정 범위의 최소·최대를 확인하세요.');
  }
  if (context.connectionPolicy != null) {
    requireValue(object(context.connectionPolicy), '연결 상태 정보를 확인하세요.');
    for (const key of ['staleMs', 'confirmationCount', 'confirmationSpanMs']) if (context.connectionPolicy[key] != null)
      requireValue(Number.isFinite(context.connectionPolicy[key]) && context.connectionPolicy[key] >= 0, '연결 대기 설정을 확인하세요.');
  }
}

export function validateExperimentSnapshot(input) {
  requireValue(object(input), '실험 내용이 없습니다.'); checkJson(input);
  requireValue(byteLength({ format: 'microbit-sensor-lab', fileVersion: EXPERIMENT_FILE_VERSION, ...input }) <= LIMITS.maxFileBytes,
    '복원할 자료가 너무 큽니다. 32 MiB 이하로 나누어 주세요.', 'FILE_TOO_LARGE');
  const snapshot = structuredClone(input), { samples, events } = snapshot;
  let { run } = snapshot;
  requireValue(object(run) && [1, 2].includes(run.schemaVersion) && string(run.id) && string(run.name) && run.name.trim().length > 0 && run.name.length <= 120
    && integer(run.runRevision) && date(run.createdAt) && date(run.updatedAt)
    && ['open', 'paused', 'complete', 'interrupted'].includes(run.status)
    && ['device', 'replay', 'import'].includes(run.source) && object(run.context), '실험 정보·버전을 확인하세요.');
  const context = run.context, channels = validateChannels(context.channels);
  requireValue(!Object.hasOwn(context, 'manualColumns'), '수동 조건 열은 센서 구성과 분리해 저장해야 합니다.');
  if (run.timeOrigin != null) requireValue(Number.isSafeInteger(run.timeOrigin) && date(run.timeOrigin), '경과 시간의 기준 시각을 확인하세요.');
  requireValue(object(context.sensor) && string(context.sensor.id) && integer(context.sensor.version)
    && context.sensor.version > 0 && (context.activity == null || (object(context.activity)
      && string(context.activity.id) && integer(context.activity.version) && context.activity.version > 0)), '센서·활동 정보를 확인하세요.');
  requireValue(Array.isArray(channels) && channels.length > 0 && channels.length <= LIMITS.maxChannels, '원자료 채널은 1~16개여야 합니다.');
  const channelIds = new Set(channels.map(c => c.id));
  if (run.importedFrom != null) requireValue(object(run.importedFrom) && string(run.importedFrom.runId)
    && ['device', 'replay', 'import'].includes(run.importedFrom.source) && date(run.importedFrom.importedAt), '가져온 실험의 출처 정보가 올바르지 않습니다.');
  requireValue(Array.isArray(samples) && samples.length <= LIMITS.maxSamples && Array.isArray(events), '원자료·사건 목록 또는 100,000행 제한을 확인하세요.');
  const imported = validateImportedColumns(run.importedColumns ?? [], context), importedIds = new Set(imported.map(c => c.id));
  requireValue(channels.length + imported.length <= LIMITS.maxChannels, '원자료와 가져온 숫자 열은 합계 16개 이하여야 합니다.');
  validateContextContent(context, imported);
  if (run.importedColumns) run.importedColumns = imported;
  for (const [i, s] of samples.entries()) {
    requireValue(object(s) && s.runId === run.id && s.sampleId === i + 1 && (s.receivedAt === null || date(s.receivedAt))
      && object(s.values) && object(s.validity) && Object.keys(s.values).length === channelIds.size
      && Object.keys(s.values).every(id => channelIds.has(id)) && channels.every(({ id }) =>
        (Number.isFinite(s.values[id]) && ['valid', 'out-of-range', 'error'].includes(s.validity[id]))
        || (s.values[id] === null && ['missing', 'unsupported', 'error'].includes(s.validity[id]))), '원자료 ID·숫자·유효성 표시를 확인하세요.');
    validateSample(s, context);
    if (s.sourceSampleId != null) requireValue(Number.isSafeInteger(s.sourceSampleId) && s.sourceSampleId > 0, '원본 자료 ID를 확인하세요.');
    if (imported.length || s.importedValues != null) {
      requireValue(object(s.importedValues) && Object.keys(s.importedValues).length === imported.length
        && Object.entries(s.importedValues).every(([id, value]) => importedIds.has(id) && object(value)
          && ((Number.isFinite(value.value) && value.reason === null)
            || (value.value === null && string(value.reason)))), '가져온 열의 숫자·빈칸·사유를 확인하세요.');
    }
    if (s.extraChannels != null) requireValue(object(s.extraChannels)
      && Object.values(s.extraChannels).every(Number.isFinite), '추가 채널의 숫자를 확인하세요.');
  }
  for (const [i, e] of events.entries()) {
    requireValue(object(e) && e.runId === run.id && e.eventId === i + 1
      && date(e.receivedAt) && string(e.type) && object(e.payload) && ['user', 'system'].includes(e.source), '사건 ID·시각·내용을 확인하세요.');
    if (isExperimentMemo(e) && Object.hasOwn(e.payload, 'withdrawn')) requireValue(typeof e.payload.withdrawn === 'boolean', '메모의 취소 상태를 확인하세요.');
  }
  for (const [key, max] of [['lastSavedSampleId', samples.length], ['lastSavedEventId', events.length]])
    requireValue(integer(run[key]) && run[key] <= max, '저장 위치가 원자료·사건 범위를 벗어납니다.');
  if (run.schemaVersion === 1) {
    requireValue(snapshot.pointRecords === undefined, '구형 실험에 점 기록이 섞여 있습니다.');
    // Validate old work before wrapping it. Migration never resets scope or interpretation.
    snapshot.workspace = upgradeWorkspace(validateWorkspace(snapshot.workspace, { run, samples }));
    run = snapshot.run = upgradeRun(run);
    snapshot.pointRecords = [];
  }
  requireValue(['continuous', 'point', null].includes(run.recordingMode) && integer(run.pointDataRevision), '기록 방식·점 자료 버전을 확인하세요.');
  run.manualColumns = validateManualColumns(run.manualColumns, context, imported);
  requireValue(Array.isArray(snapshot.pointRecords) && snapshot.pointRecords.length <= samples.length
    && (run.recordingMode !== null || (!snapshot.pointRecords.length && !run.manualColumns.length)), '점 기록 목록·기록 방식을 확인하세요.');
  const references = new Set();
  snapshot.pointRecords = snapshot.pointRecords.map((point, i) => {
    requireValue(point?.pointRecordId === i + 1 && !references.has(point.capturedSampleId), '점 번호 또는 원자료 참조가 중복되었습니다.');
    const checked = validatePointRecord(point, run, samples[point.capturedSampleId - 1]);
    references.add(checked.capturedSampleId); return checked;
  });
  requireValue(run.recordingMode !== 'point' || snapshot.pointRecords.length === samples.length, '한 점씩 측정한 원자료에는 점 기록이 함께 있어야 합니다.');
  snapshot.workspace = validateWorkspaceEnvelope(snapshot.workspace, snapshot);
  requireValue(byteLength({ format: 'microbit-sensor-lab', fileVersion: EXPERIMENT_FILE_VERSION, ...snapshot }) <= LIMITS.maxFileBytes,
    '변환한 실험 파일이 32 MiB를 넘습니다.', 'FILE_TOO_LARGE');
  return snapshot;
}

// Shared with RunStore: only the editable work is copied, never the full raw recording.
export function validateWorkspace(input, { run, samples, pointRecords = [] }, sourceId = 'recorded') {
  if (input == null) return null;
  checkJson(input);
  const work = structuredClone(input);
  const sourceSamples = samples;
  let context = run.context;
  if (sourceId === 'points') {
    work.inputSnapshot = validatePointInput(work.inputSnapshot, run, samples, pointRecords);
    samples = pointSourceRows(samples, work.inputSnapshot);
    context = { ...context, analysisSource: 'points', manualColumns: work.inputSnapshot.manualColumns };
  } else requireValue(work.inputSnapshot == null, '연속 분석에는 점 입력 사본을 사용할 수 없습니다.');
  const imported = validateImportedColumns(run.importedColumns ?? [], context);
  requireValue(object(work) && work.runId === run.id && integer(work.workspaceRevision)
    && integer(work.analysisInputRevision) && work.analysisInputRevision <= work.workspaceRevision
    && integer(work.tableLastSampleId) && work.tableLastSampleId <= sourceSamples.length
    && ['all', 'selection'].includes(work.appliedScope) && typeof work.note === 'string', '분석 작업 정보가 올바르지 않습니다.');
  const available = new Set(samples.filter(s => s.sampleId <= work.tableLastSampleId).map(s => s.sampleId));
  const ids = values => Array.isArray(values) && values.every(id => available.has(id))
    && new Set(values).size === values.length;
  requireValue(ids(work.selectedIds) && ids(work.appliedIds), '선택·분석 대상에 없는 자료 ID가 있습니다.');
  const appliedBoundary = work.appliedThroughSampleId ?? work.tableLastSampleId;
  requireValue(integer(appliedBoundary) && appliedBoundary <= work.tableLastSampleId
    && work.appliedIds.every(id => id <= appliedBoundary), '분석에 적용한 자료 경계를 확인하세요.');
  const allIds = samples.filter(s => s.sampleId <= appliedBoundary && (sourceId !== 'points' || !s.withdrawn)).map(s => s.sampleId);
  const appliedIds = new Set(work.appliedIds);
  requireValue(work.appliedScope !== 'all' || (appliedIds.size === allIds.length && allIds.every(id => appliedIds.has(id))), '전체 분석 자료의 범위를 확인하세요.');
  if (sourceId === 'points') requireValue(work.tableLastSampleId <= work.inputSnapshot.throughSampleId, '점 분석의 읽기 경계를 확인하세요.');
  work.analysisRange = validateAnalysisRange(work.analysisRange, samples, work);
  if (work.reflection?.answers != null) {
    const questionIds = new Set((context.questions ?? context.activity?.questions ?? REFLECTION_QUESTIONS).map(q => q.id));
    requireValue(object(work.reflection.answers) && Object.keys(work.reflection.answers).every(id => questionIds.has(id)), '해석 답변의 질문 ID를 확인하세요.');
  }
  if (sourceId === 'points' && work.reflection?.evidence) {
    const evidence = work.reflection.evidence;
    requireValue(evidence.sourceId === 'points', '보관 근거의 자료 종류를 확인하세요.');
    const savedInput = validatePointInput(evidence.inputSnapshot, run, sourceSamples, pointRecords);
    const evidenceRows = pointSourceRows(sourceSamples, savedInput);
    requireValue(evidence.tableLastSampleId <= savedInput.throughSampleId, '보관 근거의 입력 경계를 확인하세요.');
    work.reflection = validateReflection(work.reflection, evidenceRows, imported,
      { ...run.context, analysisSource: 'points', manualColumns: savedInput.manualColumns }, { throughSampleId: savedInput.throughSampleId,
        withdrawnIds: new Set(savedInput.points.filter(point => point.withdrawn).map(point => point.capturedSampleId)) });
    Object.assign(work.reflection.evidence, { sourceId: 'points', inputSnapshot: savedInput });
  } else {
    requireValue(!work.reflection?.evidence?.inputSnapshot && !work.reflection?.evidence?.sourceId,
      '연속 자료의 보관 근거 형식을 확인하세요.');
    work.reflection = validateReflection(work.reflection, samples, imported, context);
  }
  requireValue(Array.isArray(work.exclusions) && ids(work.exclusions.map(e => e?.sampleId))
    && work.exclusions.every(e => typeof e.reason === 'string' && e.reason.length <= 200), '제외 자료·사유가 올바르지 않습니다.');
  requireValue(Array.isArray(work.calculatedColumns) && work.calculatedColumns.length <= LIMITS.maxCalculatedColumns, '계산 열은 32개 이하여야 합니다.');
  work.calculatedColumns = validateCalculatedColumns(work.calculatedColumns, imported, context);
  work.graph = validateGraph(work.graph, work.calculatedColumns, imported, context);
  requireValue(work.regression == null || (object(work.regression) && typeof work.regression.enabled === 'boolean'), '추세선 설정이 올바르지 않습니다.');
  work.regression = { enabled: work.regression?.enabled === true };
  requireValue(!work.regression.enabled || work.graph !== null, '추세선의 그래프가 없습니다.');
  const columnIds = new Set([...getSourceColumns(context), ...imported, ...work.calculatedColumns].map(c => c.id));
  requireValue(object(work.table) && object(work.table.sort) && columnIds.has(work.table.sort.columnId)
    && ['asc', 'desc'].includes(work.table.sort.direction), '표 정렬 설정이 올바르지 않습니다.');
  work.table = { sort: work.table.sort, filter: normalizeFilter(work.table.filter, [...imported, ...work.calculatedColumns], context) };
  return work;
}

export function validateWorkspaceEnvelope(input, snapshot) {
  if (input == null) return null;
  checkJson(input);
  const { run, pointRecords = [] } = snapshot;
  requireValue(object(input) && input.runId === run.id && integer(input.envelopeRevision) && input.envelopeRevision > 0
    && object(input.bySource) && ['recorded', 'points'].includes(input.activeSourceId)
    && Object.hasOwn(input.bySource, input.activeSourceId), '자료별 분석 저장 정보를 확인하세요.');
  const bySource = {};
  for (const [sourceId, state] of Object.entries(input.bySource)) {
    requireValue(['recorded', 'points'].includes(sourceId) && object(state)
      && (sourceId !== 'recorded' || run.recordingMode !== 'point')
      && (sourceId !== 'points' || pointRecords.length > 0 || run.recordingMode === 'point'), '없는 분석 자료를 참조하고 있습니다.');
    bySource[sourceId] = validateWorkspace(state, snapshot, sourceId);
  }
  return { runId: run.id, envelopeRevision: input.envelopeRevision, activeSourceId: input.activeSourceId, bySource };
}
