// Adapted from Cho-WH/bme280 59c5c149450f970bace2deaa183857c275595853,
// gay-lussac/data/run-store.js. Pending queues, revision acknowledgements and locks retained.
import { DATABASE, withEventNote, validateSample } from '../domain/contracts.js';
import { LIMITS } from '../domain/limits.js';
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
 * onChange?:(state:any)=>void,temporary?:boolean}} options */
export async function openRunStore({ repository, id = crypto.randomUUID(), context, source = 'device',
  name, create = false, importSnapshot = null, locks = globalThis.navigator?.locks, timers = globalThis,
  now = () => Date.now(), saveDelay = 1000, onChange = (_state) => {}, temporary = false }) {
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
        initial = { run: { id, schemaVersion: 1, runRevision: 1, name: name?.trim() || defaultName,
          createdAt, updatedAt: createdAt, status: 'open', context: structuredClone(context), source,
          lastSavedSampleId: 0, lastSavedEventId: 0, provenance: null }, samples: [], events: [], workspace: null };
        initial = validateExperimentSnapshot(initial);
      }
      const initialLimit = LIMITS.fileBytes - (importSnapshot ? 0 : lifecycleReserve);
      if (jsonBytes({ format: 'microbit-sensor-lab', fileVersion: 1, ...initial }) > initialLimit) throw fail('file-budget', '실험 파일 용량 한도를 넘었습니다.');
      // Detect unavailable storage before opening the recording gate; imports are all-or-nothing.
      if (!temporary) await repository.commitBatch({ ...structuredClone(initial), baseRunRevision: 0, insertOnly: true });
    } else {
      initial = await repository.readSnapshot(id);
      if (!initial) throw fail('run-not-found', '이 브라우저에 해당 실험이 없습니다.');
    }
  } catch (error) { releaseLock(); await lockTask; throw error; }

  let run = structuredClone(initial.run), samples = structuredClone(initial.samples), events = structuredClone(initial.events);
  let workspace = structuredClone(initial.workspace);
  let saved = { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId ?? 0,
    runRevision: run.runRevision, workspaceRevision: workspace?.workspaceRevision ?? 0 };
  let lastSampleId = samples.at(-1)?.sampleId ?? 0, lastEventId = events.at(-1)?.eventId ?? 0;
  const editedEvents = new Map();
  let eventsVersion = 0, timer = null, saving = null, error = null, closed = false, removing = false, retryBatch = null;
  // Arrays are measured once at open and incrementally after each append, never copied per reading.
  let sampleBytes = jsonBytes(samples), eventBytes = jsonBytes(events), workspaceBytes = jsonBytes(workspace);
  const budgetBytes = (nextRun = run, nextWorkspace = workspace, nextSampleBytes = sampleBytes, nextEventBytes = eventBytes) =>
    jsonBytes({ format: 'microbit-sensor-lab', fileVersion: 1, run: nextRun, samples: [], events: [], workspace: null })
      + nextSampleBytes + nextEventBytes - 8 + (nextWorkspace === workspace ? workspaceBytes : jsonBytes(nextWorkspace));
  function admit({ nextRun = run, nextWorkspace = workspace, nextSampleBytes = sampleBytes, nextEventBytes = eventBytes, reserve = lifecycleReserve } = {}) {
    if (budgetBytes(nextRun, nextWorkspace, nextSampleBytes, nextEventBytes) > LIMITS.fileBytes - reserve) {
      throw fail('file-budget', '실험 파일 용량 한도에 가까워졌어요. 자료를 보관한 뒤 새 실험을 시작해 주세요.');
    }
  }
  const dirty = () => lastSampleId > saved.sampleId || lastEventId > saved.eventId
    || run.runRevision > saved.runRevision || (workspace?.workspaceRevision ?? 0) > saved.workspaceRevision;
  const assertWriter = () => { if (!writable || closed || removing) throw fail('read-only', '이 실험은 읽기 전용입니다.'); };
  function getState() {
    return { id, name: run.name, source: run.source, writable: writable && !closed && !removing, temporary, runStatus: run.status,
      status: saving ? 'saving' : error ? 'error' : dirty() ? 'pending' : 'clean',
      error: error?.message ?? '', errorCode: error?.code ?? '', sampleCount: samples.length, eventCount: events.length, eventsVersion,
      pendingSamples: lastSampleId - saved.sampleId,
      pendingEvents: lastEventId - saved.eventId + [...editedEvents.keys()].filter(eventId => eventId <= saved.eventId).length,
      lastSampleId, lastEventId, savedSampleId: saved.sampleId, runRevision: run.runRevision,
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
  function appendSample(sample) {
    assertWriter();
    if (run.source === 'import') throw fail('imported-source', '가져온 원자료에 측정값을 추가할 수 없습니다. 새 실험을 준비해 주세요.');
    if (sample.sampleId !== lastSampleId + 1) throw fail('sample-order', '샘플 ID는 순서대로 증가해야 합니다.');
    if (samples.length >= LIMITS.samples) throw fail('sample-limit', '측정값 개수 한도에 도달했어요. 보관 후 새 실험을 시작해 주세요.');
    checkSerializable(sample, 2);
    const next = validateSample({ ...sample, runId: id }, run.context);
    const bytes = sampleBytes + jsonBytes(next) + (samples.length ? 1 : 0);
    admit({ nextSampleBytes: bytes });
    samples.push(structuredClone(next)); sampleBytes = bytes; lastSampleId = sample.sampleId; changed();
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
  function saveWorkspace(next) {
    assertWriter();
    if (!Number.isSafeInteger(next.workspaceRevision) || next.workspaceRevision <= (workspace?.workspaceRevision ?? 0)) throw fail('workspace-revision', '작업 버전은 증가해야 합니다.');
    if ((next.calculatedColumns?.length ?? 0) > LIMITS.calculatedColumns) throw fail('calculation-limit', '계산 열 개수 한도를 넘었습니다.');
    checkSerializable(next, 1);
    const record = validateWorkspace({ ...next, runId: id }, { run, samples });
    admit({ nextWorkspace: record });
    workspace = record; workspaceBytes = jsonBytes(record); changed();
  }
  async function saveBatch() {
    const batch = retryBatch ?? { run: { ...structuredClone(run), lastSavedSampleId: lastSampleId, lastSavedEventId: lastEventId },
      samples: structuredClone(samples.filter((s) => s.sampleId > saved.sampleId)),
      events: structuredClone(events.filter((e) => e.eventId > saved.eventId || editedEvents.has(e.eventId))),
      workspace: (workspace?.workspaceRevision ?? 0) > saved.workspaceRevision ? structuredClone(workspace) : null,
      baseRunRevision: saved.runRevision };
    retryBatch = batch;
    try {
      const ack = temporary ? { sampleId: batch.run.lastSavedSampleId, eventId: batch.run.lastSavedEventId,
        runRevision: batch.run.runRevision, workspaceRevision: batch.workspace?.workspaceRevision ?? null }
        : await repository.commitBatch(batch);
      saved = { ...ack, workspaceRevision: ack.workspaceRevision ?? saved.workspaceRevision };
      for (const [eventId, revision] of editedEvents) if (revision <= saved.runRevision) editedEvents.delete(eventId);
      run.lastSavedSampleId = saved.sampleId; run.lastSavedEventId = saved.eventId;
      error = null; retryBatch = null;
    } catch (failure) { error = failure; throw failure; }
  }
  async function flush() {
    if (!writable || closed) return;
    timers.clearTimeout(timer); timer = null;
    const target = { sampleId: lastSampleId, eventId: lastEventId, runRevision: run.runRevision, workspaceRevision: workspace?.workspaceRevision ?? 0 };
    const reached = () => Object.keys(target).every((key) => saved[key] >= target[key]);
    while (!reached()) {
      if (!saving) {
        saving = saveBatch().finally(() => { saving = null; emit(); schedule(); }); emit();
      }
      await saving;
    }
  }
  const getSnapshot = () => structuredClone({ run, samples, events, workspace });
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
    updateRun, appendSample, appendEvent, updateEventNote, saveWorkspace, flush, close, dispose, remove };
}

export const importRunSnapshot = (options) => openRunStore({ ...options, importSnapshot: options.snapshot });

// Same editing owner and export boundary, but explicitly no database or lock capability.
// Only validated imported snapshots can use this path; live recording still needs durable storage.
export const openTemporaryRunStore = ({ snapshot, ...options }) =>
  openRunStore({ ...options, repository: null, importSnapshot: snapshot, temporary: true });
