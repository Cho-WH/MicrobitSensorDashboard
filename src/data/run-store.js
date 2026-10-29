import { createUuid } from '../domain/uuid.js';
// Adapted from Cho-WH/bme280 59c5c149450f970bace2deaa183857c275595853,
// gay-lussac/data/run-store.js. Pending queues, revision acknowledgements and locks retained.
import { DATABASE, withEventNote, withEventWithdrawn, validateSample, RUN_SCHEMA_VERSION, EXPERIMENT_FILE_VERSION } from '../domain/contracts.js';
import { validateManualColumns, validatePointRecord } from '../domain/point-records.js';
import { getAnalysisSourceSnapshot } from '../analysis/data-source.js';
import { LIMITS } from '../domain/limits.js';
import { canResumeImportedRun } from './files/recording-source.js';
import { validateExperimentSnapshot, validateWorkspace } from './files/validation.js';

const fail = (code, message) => Object.assign(new Error(message), { code });
const encoder = new TextEncoder();
const jsonBytes = (value) => encoder.encode(JSON.stringify(value)).length;
const lifecycleReserve = 8192;

function checkSerializable(value, depth = 0) {
  if (depth >= 40 || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint'
    || (typeof value === 'number' && !Number.isFinite(value))) throw fail('invalid-record', '파일로 보관할 수 없는 자료입니다.');
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail('invalid-record', '자료는 일반 객체와 배열로 보관해야 합니다.');
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw fail('invalid-record', '허용되지 않은 자료 항목입니다.');
    checkSerializable(child, depth + 1);
  }
}

// One owner for confirmed data and pending changes. Display caches never become records.
/** @param {{repository?:any,id?:string,context?:any,source?:string,name?:string,create?:boolean,
 * importSnapshot?:any,locks?:any,timers?:any,now?:()=>number,saveDelay?:number,
 * onChange?:(state:any)=>void,temporary?:boolean,recordingMode?:'continuous'|'point',manualColumns?:any[],initialPoint?:any,beforeCreate?:()=>void}} options */
export async function openRunStore({ repository, id = createUuid(), context, source = 'device',
  name, create = false, importSnapshot = null, locks = globalThis.navigator?.locks, timers = globalThis,
  now = () => Date.now(), saveDelay = 1000, onChange = (_state) => {}, temporary = false,
  recordingMode = 'continuous', manualColumns = [], initialPoint = null, beforeCreate = () => {} }) {
  if (temporary && !importSnapshot) throw fail('temporary-import-only', '임시 분석은 가져온 실험 파일에서만 시작할 수 있어요.');
  let releaseLock = () => {}, lockTask;
  const writable = temporary ? true : locks ? await new Promise((resolve, reject) => {
    lockTask = locks.request(`${DATABASE.name}:run:${id}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(false); return; }
      const held = new Promise((release) => { releaseLock = () => release(undefined); });
      resolve(true);
      await held;
    }).catch(reject);
  }) : false;
  let initial;
  try {
    if (create || importSnapshot) {
      if (!writable) throw fail('read-only', locks ? '다른 탭에서 이 실험을 수정 중이에요. 그 탭을 닫고 다시 시도해 주세요.'
        : '이 브라우저에서는 측정값을 기록할 수 없어요. 파일 분석은 계속 사용할 수 있어요.');
      if (!temporary) await repository.open?.();
      if (importSnapshot) {
        const { prepareImportedSnapshot } = await import('./files/json.js');
        initial = prepareImportedSnapshot(importSnapshot, { newId: () => id, now });
      } else {
        if (!context?.channels?.length || context.channels.length > LIMITS.channels) throw fail('invalid-context', '측정할 센서와 채널을 확인해 주세요.');
        const createdAt = now(), date = new Date(createdAt);
        const defaultName = `센서 실험 · ${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 120)) throw fail('invalid-name', '실험 이름을 1~120자로 입력해 주세요.');
        checkSerializable(context, 2);
        if (!['continuous', 'point'].includes(recordingMode) || (recordingMode === 'point') !== !!initialPoint)
          throw fail('recording-mode', '한 점씩 측정은 첫 유효 기록과 함께 시작해야 합니다.');
        initial = { run: { id, schemaVersion: RUN_SCHEMA_VERSION, runRevision: 1, name: name?.trim() || defaultName,
          createdAt, updatedAt: createdAt, status: 'open', context: structuredClone(context), source,
          recordingMode, manualColumns: validateManualColumns(manualColumns, context), pointDataRevision: initialPoint ? 1 : 0,
          lastSavedSampleId: initialPoint ? 1 : 0, lastSavedEventId: 0, provenance: null }, samples: [], events: [], pointRecords: [], workspace: null };
        if (initialPoint) {
          initial.samples.push({ ...structuredClone(initialPoint.sample), runId: id, sampleId: 1 });
          initial.pointRecords.push({ runId: id, pointRecordId: 1, capturedSampleId: 1,
            capturedAt: initialPoint.capturedAt, manualValues: structuredClone(initialPoint.manualValues ?? Object.fromEntries(manualColumns.map(c => [c.id, null]))),
            note: initialPoint.note ?? '', withdrawn: false, revision: 1 });
        }
        initial = validateExperimentSnapshot(initial);
      }
      const initialLimit = LIMITS.fileBytes - (importSnapshot ? 0 : lifecycleReserve);
      if (jsonBytes({ format: 'microbit-sensor-lab', fileVersion: EXPERIMENT_FILE_VERSION, ...initial }) > initialLimit) throw fail('file-budget', '실험 파일 용량 한도를 넘었습니다.');
      // Detect unavailable storage before opening the recording gate; imports are all-or-nothing.
      if (!temporary) {
        if (create) beforeCreate();
        try { await repository.commitBatch({ ...structuredClone(initial), baseRunRevision: 0, insertOnly: true }); }
        catch (failure) {
          // The first point may have committed even if its acknowledgement was lost.
          // Confirm under the same writer lock before making the caller retry a capture.
          const recovered = initialPoint ? await repository.readSnapshot(id).catch(() => null) : null;
          if (!recovered || !['run', 'samples', 'events', 'pointRecords', 'workspace'].every(key =>
            JSON.stringify(recovered[key]) === JSON.stringify(initial[key]))) throw failure;
        }
      }
    } else {
      initial = await repository.readSnapshot(id);
      if (!initial) throw fail('run-not-found', '이 브라우저에 해당 실험이 없습니다.');
    }
  } catch (error) { releaseLock(); await lockTask; throw error; }

  let run = structuredClone(initial.run), samples = structuredClone(initial.samples), events = structuredClone(initial.events);
  let pointRecords = structuredClone(initial.pointRecords);
  const pointBySample = new Map(pointRecords.map(point => [point.capturedSampleId, point.pointRecordId]));
  const editedPoints = new Map();
  const canAppend = !temporary && (run.source !== 'import' || canResumeImportedRun(run));
  let workspace = structuredClone(initial.workspace);
  let saved = { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId ?? 0,
    runRevision: run.runRevision, envelopeRevision: workspace?.envelopeRevision ?? 0 };
  let lastSampleId = samples.at(-1)?.sampleId ?? 0, lastEventId = events.at(-1)?.eventId ?? 0;
  const editedEvents = new Map();
  let eventsVersion = 0, timer = null, saving = null, error = null, closed = false, removing = false, retryBatch = null;
  // Arrays are measured once at open and incrementally after each append, never copied per reading.
  let sampleBytes = jsonBytes(samples), eventBytes = jsonBytes(events), workspaceBytes = jsonBytes(workspace);
  let pointBytes = jsonBytes(pointRecords);
  const budgetBytes = (nextRun = run, nextWorkspace = workspace, nextSampleBytes = sampleBytes, nextEventBytes = eventBytes, nextPointBytes = pointBytes) =>
    jsonBytes({ format: 'microbit-sensor-lab', fileVersion: EXPERIMENT_FILE_VERSION, run: nextRun, samples: [], events: [], pointRecords: [], workspace: null })
      + nextSampleBytes + nextEventBytes + nextPointBytes - 10 + (nextWorkspace === workspace ? workspaceBytes : jsonBytes(nextWorkspace));
  function admit({ nextRun = run, nextWorkspace = workspace, nextSampleBytes = sampleBytes, nextEventBytes = eventBytes, nextPointBytes = pointBytes, reserve = lifecycleReserve } = {}) {
    if (budgetBytes(nextRun, nextWorkspace, nextSampleBytes, nextEventBytes, nextPointBytes) > LIMITS.fileBytes - reserve) {
      throw fail('file-budget', '실험 파일 용량 한도에 가까워졌어요. 자료를 보관한 뒤 새 실험을 시작해 주세요.');
    }
  }
  const dirty = () => lastSampleId > saved.sampleId || lastEventId > saved.eventId
    || run.runRevision > saved.runRevision || (workspace?.envelopeRevision ?? 0) > saved.envelopeRevision;
  const assertWriter = () => { if (!writable || closed || removing) throw fail('read-only', '이 실험은 읽기 전용입니다.'); };
  function getState() {
    return { id, name: run.name, source: run.source, writable: writable && !closed && !removing, temporary, runStatus: run.status,
      timeOrigin: run.timeOrigin ?? null,
      status: saving ? 'saving' : error ? 'error' : dirty() ? 'pending' : 'clean',
      error: error?.message ?? '', errorCode: error?.code ?? '', sampleCount: samples.length, eventCount: events.length, eventsVersion,
      pendingSamples: lastSampleId - saved.sampleId,
      pendingEvents: lastEventId - saved.eventId + [...editedEvents.keys()].filter(eventId => eventId <= saved.eventId).length,
      lastSampleId, lastEventId, savedSampleId: saved.sampleId, runRevision: run.runRevision,
      recordingMode: run.recordingMode, pointDataRevision: run.pointDataRevision,
      pointCount: pointRecords.length - withdrawnCount, withdrawnPointCount: withdrawnCount,
      serializedBytes: budgetBytes(), nearLimit: samples.length >= LIMITS.samples * 0.9 || budgetBytes() >= LIMITS.fileBytes * 0.9 };
  }
  const emit = () => onChange(getState());
  function schedule() {
    if (!closed && writable && dirty() && !error && timer === null) {
      timer = timers.setTimeout(() => { timer = null; void flush().catch(() => {}); }, saveDelay);
    }
  }
  function changed() { run.runRevision++; run.updatedAt = now(); schedule(); emit(); }
  function updateRun(patch) {
    assertWriter();
    if ('name' in patch) {
      if (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.trim().length > 120) throw fail('invalid-name', '실험 이름을 1~120자로 입력해 주세요.');
      patch = { ...patch, name: patch.name.trim() };
    }
    if ('status' in patch && !['open', 'paused', 'complete', 'interrupted'].includes(patch.status)) throw fail('invalid-status', '기록 상태가 올바르지 않습니다.');
    for (const key of Object.keys(patch)) if (!['name', 'status'].includes(key)) throw fail('immutable-run', `수정할 수 없는 실험 항목: ${key}`);
    const next = { ...run, ...structuredClone(patch) };
    admit({ nextRun: next, reserve: 'status' in patch ? 256 : lifecycleReserve });
    run = next; changed();
  }
  let withdrawnCount = pointRecords.filter(point => point.withdrawn).length;
  function prepareSample(sample) {
    assertWriter();
    if (!canAppend) throw fail('imported-source', '이 자료에는 측정값을 추가할 수 없습니다. 새 실험을 준비해 주세요.');
    if (sample.sampleId !== lastSampleId + 1) throw fail('sample-order', '샘플 ID는 순서대로 증가해야 합니다.');
    if (samples.length >= LIMITS.samples) throw fail('sample-limit', '측정값 개수 한도에 도달했어요. 보관 후 새 실험을 시작해 주세요.');
    checkSerializable(sample, 2);
    const next = validateSample({ ...sample, runId: id }, run.context);
    // Imported fixed columns have no device source. Preserve old cells and mark new ones missing.
    if (run.importedColumns?.length) next.importedValues = Object.fromEntries(run.importedColumns.map(column =>
      [column.id, { value: null, reason: '추가 측정에서 제공되지 않은 값' }]));
    return next;
  }
  function appendSample(sample) {
    if (run.recordingMode === 'point') throw fail('point-required', '한 점씩 측정한 원자료는 점 기록과 함께 추가해야 합니다.');
    const next = prepareSample(sample);
    const bytes = sampleBytes + jsonBytes(next) + (samples.length ? 1 : 0);
    admit({ nextSampleBytes: bytes });
    samples.push(structuredClone(next)); sampleBytes = bytes; lastSampleId = sample.sampleId; changed();
  }
  function appendPointRecord(point, sample = null) {
    assertWriter();
    if (!canAppend || !['continuous', 'point'].includes(run.recordingMode)) throw fail('imported-source', '이 자료에는 점을 추가할 수 없습니다.');
    if (error) throw fail('storage-error', '저장 오류를 해결한 뒤 기록해 주세요.');
    if ((run.recordingMode === 'point') !== !!sample) throw fail('point-required', '기록 방식에 맞는 원자료가 필요합니다.');
    checkSerializable(point, 2);
    const nextSample = sample ? prepareSample(sample) : null;
    const sampleId = nextSample?.sampleId ?? point.capturedSampleId;
    if (pointBySample.has(sampleId)) throw fail('duplicate-point', '이미 기록한 수신값입니다. 새 수신값을 기다리거나 기록을 복원하세요.');
    const nextRun = { ...run, pointDataRevision: run.pointDataRevision + 1 };
    const record = validatePointRecord({ runId: id, pointRecordId: pointRecords.length + 1, capturedSampleId: sampleId,
      capturedAt: point.capturedAt, manualValues: point.manualValues ?? Object.fromEntries(run.manualColumns.map(c => [c.id, null])),
      note: point.note ?? '', withdrawn: false, revision: nextRun.pointDataRevision }, nextRun, nextSample ?? samples[sampleId - 1]);
    const nextSampleBytes = sampleBytes + (nextSample ? jsonBytes(nextSample) + (samples.length ? 1 : 0) : 0);
    const nextPointBytes = pointBytes + jsonBytes(record) + (pointRecords.length ? 1 : 0);
    admit({ nextRun, nextSampleBytes, nextPointBytes });
    if (nextSample) { samples.push(nextSample); lastSampleId = nextSample.sampleId; sampleBytes = nextSampleBytes; }
    pointRecords.push(record); pointBytes = nextPointBytes; pointBySample.set(sampleId, record.pointRecordId); run = nextRun;
    editedPoints.set(record.pointRecordId, run.runRevision + 1); changed(); return record.pointRecordId;
  }
  function editPoint(pointRecordId, patch) {
    assertWriter(); checkSerializable(patch, 2);
    const previous = pointRecords[pointRecordId - 1];
    if (!previous || previous.pointRecordId !== pointRecordId) throw fail('point-missing', '수정할 점 기록을 확인하세요.');
    const nextRun = { ...run, pointDataRevision: run.pointDataRevision + 1 };
    const next = validatePointRecord({ ...previous, ...patch, revision: nextRun.pointDataRevision }, nextRun, samples[previous.capturedSampleId - 1]);
    if (JSON.stringify({ ...next, revision: previous.revision }) === JSON.stringify(previous)) return false;
    const bytes = pointBytes - jsonBytes(previous) + jsonBytes(next);
    admit({ nextRun, nextPointBytes: bytes });
    pointRecords[pointRecordId - 1] = next; pointBytes = bytes; run = nextRun;
    withdrawnCount += Number(next.withdrawn) - Number(previous.withdrawn);
    editedPoints.set(pointRecordId, run.runRevision + 1); changed(); return true;
  }
  function updatePointRecord(pointRecordId, patch) {
    if (!patch || Object.keys(patch).some(key => !['manualValues', 'note'].includes(key))) throw fail('immutable-point', '조건값과 메모만 수정할 수 있어요.');
    return editPoint(pointRecordId, patch);
  }
  function setManualColumn(column) {
    assertWriter(); checkSerializable(column);
    if (run.recordingMode === null) throw fail('recording-mode', '불러온 숫자 열은 조건 편집 열로 바꿀 수 없습니다.');
    const columns = validateManualColumns([column], run.context, run.importedColumns);
    if (run.manualColumns.length && run.manualColumns[0].id !== columns[0].id) throw fail('immutable-column', '기존 조건 열의 ID는 바꿀 수 없습니다.');
    if (JSON.stringify(columns) === JSON.stringify(run.manualColumns)) return false;
    const nextRun = { ...run, manualColumns: columns, pointDataRevision: run.pointDataRevision + 1 };
    const adding = !run.manualColumns.length;
    const nextPoints = adding ? pointRecords.map(point => ({ ...point, manualValues: { [column.id]: null }, revision: nextRun.pointDataRevision })) : pointRecords;
    const bytes = adding ? jsonBytes(nextPoints) : pointBytes;
    admit({ nextRun, nextPointBytes: bytes });
    if (adding) for (const point of nextPoints) editedPoints.set(point.pointRecordId, run.runRevision + 1);
    run = nextRun; pointRecords = nextPoints; pointBytes = bytes; changed(); return true;
  }
  function appendEvent(event) {
    assertWriter();
    if (!event || typeof event.type !== 'string' || !event.type || !Number.isFinite(event.receivedAt) || Math.abs(event.receivedAt) > 8640000000000000
      || !['user', 'system'].includes(event.source) || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) throw fail('invalid-event', '실험 기록의 형식을 확인해 주세요.');
    checkSerializable(event, 2);
    const record = { ...structuredClone(event), runId: id, eventId: lastEventId + 1 };
    const bytes = eventBytes + jsonBytes(record) + (events.length ? 1 : 0);
    const essential = ['recording-paused', 'measurement-end', 'interrupted', 'recording-limit'].includes(event.type);
    admit({ nextEventBytes: bytes, reserve: essential ? 256 : lifecycleReserve });
    events.push(record); eventBytes = bytes; lastEventId++; eventsVersion++; changed(); return record.eventId;
  }
  function updateEventNote(eventId, note) {
    assertWriter();
    const index = events.findIndex(event => event.eventId === eventId);
    const next = withEventNote(events[index], note);
    if ((events[index].payload.note ?? '') === next.payload.note) return;
    const bytes = eventBytes - jsonBytes(events[index]) + jsonBytes(next);
    admit({ nextEventBytes: bytes });
    events[index] = next; eventBytes = bytes;
    editedEvents.set(eventId, run.runRevision + 1); eventsVersion++; changed();
  }
  function setEventWithdrawn(eventId, withdrawn) {
    assertWriter();
    const index = events.findIndex(event => event.eventId === eventId), previous = events[index];
    const next = withEventWithdrawn(previous, withdrawn);
    if (!!previous.payload.withdrawn === withdrawn) return;
    const bytes = eventBytes - jsonBytes(previous) + jsonBytes(next);
    admit({ nextEventBytes: bytes }); events[index] = next; eventBytes = bytes;
    editedEvents.set(eventId, run.runRevision + 1); eventsVersion++; changed();
  }
  function saveWorkspace(sourceId, next) {
    assertWriter();
    if (!['recorded', 'points'].includes(sourceId) || (sourceId === 'recorded' && run.recordingMode === 'point')
      || (sourceId === 'points' && !pointRecords.length && run.recordingMode !== 'point')) throw fail('analysis-source', '분석할 자료를 확인하세요.');
    if (!Number.isSafeInteger(next.workspaceRevision) || next.workspaceRevision <= (workspace?.bySource[sourceId]?.workspaceRevision ?? 0)) throw fail('workspace-revision', '작업 버전은 증가해야 합니다.');
    if ((next.calculatedColumns?.length ?? 0) > LIMITS.calculatedColumns) throw fail('calculation-limit', '계산 열 개수 한도를 넘었습니다.');
    checkSerializable(next, 1);
    const state = validateWorkspace({ ...next, runId: id }, { run, samples, pointRecords }, sourceId);
    const record = { runId: id, envelopeRevision: (workspace?.envelopeRevision ?? 0) + 1,
      activeSourceId: workspace?.activeSourceId ?? sourceId, bySource: { ...workspace?.bySource, [sourceId]: state } };
    admit({ nextWorkspace: record });
    workspace = record; workspaceBytes = jsonBytes(record); changed();
  }
  function setActiveSource(sourceId) {
    assertWriter();
    if (!workspace?.bySource[sourceId]) throw fail('analysis-source', '먼저 분석 자료를 열어 주세요.');
    if (workspace.activeSourceId === sourceId) return false;
    const record = { ...workspace, activeSourceId: sourceId, envelopeRevision: workspace.envelopeRevision + 1 };
    admit({ nextWorkspace: record }); workspace = record; workspaceBytes = jsonBytes(record); changed(); return true;
  }
  async function saveBatch() {
    const batch = retryBatch ?? { run: { ...structuredClone(run), lastSavedSampleId: lastSampleId, lastSavedEventId: lastEventId },
      samples: structuredClone(samples.filter((s) => s.sampleId > saved.sampleId)),
      events: structuredClone(events.filter((e) => e.eventId > saved.eventId || editedEvents.has(e.eventId))),
      pointRecords: structuredClone(pointRecords.filter(point => editedPoints.has(point.pointRecordId))),
      workspace: (workspace?.envelopeRevision ?? 0) > saved.envelopeRevision ? structuredClone(workspace) : null,
      baseRunRevision: saved.runRevision };
    retryBatch = batch;
    try {
      const ack = temporary ? { sampleId: batch.run.lastSavedSampleId, eventId: batch.run.lastSavedEventId,
        runRevision: batch.run.runRevision, envelopeRevision: batch.workspace?.envelopeRevision ?? null }
        : await repository.commitBatch(batch);
      saved = { ...ack, envelopeRevision: ack.envelopeRevision ?? saved.envelopeRevision };
      for (const [eventId, revision] of editedEvents) if (revision <= saved.runRevision) editedEvents.delete(eventId);
      for (const [pointId, revision] of editedPoints) if (revision <= saved.runRevision) editedPoints.delete(pointId);
      run.lastSavedSampleId = saved.sampleId; run.lastSavedEventId = saved.eventId;
      error = null; retryBatch = null;
    } catch (failure) { error = failure; throw failure; }
  }
  async function flush() {
    if (!writable || closed) return;
    timers.clearTimeout(timer); timer = null;
    const target = { sampleId: lastSampleId, eventId: lastEventId, runRevision: run.runRevision, envelopeRevision: workspace?.envelopeRevision ?? 0 };
    const reached = () => Object.keys(target).every((key) => saved[key] >= target[key]);
    while (!reached()) {
      if (!saving) {
        saving = saveBatch().finally(() => { saving = null; emit(); schedule(); }); emit();
      }
      await saving;
    }
  }
  const getSnapshot = () => structuredClone({ run, samples, events, pointRecords, workspace });
  function readSamples({ afterId = 0, throughId = lastSampleId } = {}) {
    const boundary = (id) => {
      let low = 0, high = samples.length;
      while (low < high) { const middle = (low + high) >>> 1; if (samples[middle].sampleId <= id) low = middle + 1; else high = middle; }
      return low;
    };
    return structuredClone(samples.slice(boundary(afterId), boundary(throughId)));
  }
  async function close() { if (writable) await flush(); dispose(); await lockTask; }
  async function remove() {
    assertWriter();
    if (saving || dirty()) throw fail('pending-save', '아직 저장 중인 자료가 있어요. 저장을 마친 뒤 삭제해 주세요.');
    removing = true;
    try { if (!temporary) await repository.deleteRun(id); dispose(); await lockTask; }
    finally { removing = false; }
  }
  function dispose() {
    closed = true; timers.clearTimeout(timer); timer = null;
    // Teardown cannot hand a second tab the lock while this transaction is still in flight.
    if (saving) void saving.finally(releaseLock).catch(() => {});
    else releaseLock();
  }
  return { getState, getSnapshot, getRun: () => structuredClone(run),
    getEvents: (limit = 15) => structuredClone(events.slice(-limit)),
    getSamples: () => structuredClone(samples), readSamples,
    getLatestSample: () => structuredClone(samples.at(-1) ?? null), getFirstSample: () => structuredClone(samples[0] ?? null),
    getPointRecords: () => structuredClone(pointRecords),
    getAnalysisSourceSnapshot: sourceId => getAnalysisSourceSnapshot({ run, samples, pointRecords }, sourceId),
    updateRun, appendSample, appendPointRecord, updatePointRecord, setManualColumn,
    setPointWithdrawn: (pointRecordId, withdrawn) => editPoint(pointRecordId, { withdrawn }),
    appendEvent, updateEventNote, setEventWithdrawn, saveWorkspace, setActiveSource, flush, close, dispose, remove };
}

export const importRunSnapshot = (options) => openRunStore({ ...options, importSnapshot: options.snapshot });

// Same editing owner and export boundary, but explicitly no database or lock capability.
// Only validated imported snapshots can use this path; live recording still needs durable storage.
export const openTemporaryRunStore = ({ snapshot, ...options }) =>
  openRunStore({ ...options, repository: null, importSnapshot: snapshot, temporary: true });
