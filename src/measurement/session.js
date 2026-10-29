// Adapted from Cho-WH/bme280 59c5c149450f970bace2deaa183857c275595853,
// gay-lussac/measurement/session.js. Recording gate is explicit; activity rules are injected.
import { createReceptionMonitor, discontinuityReason } from './reception-monitor.js';
import { canResumeImportedRun } from '../data/files/recording-source.js';
import { createPointCapture } from './point-capture.js';

const fail = (code, message) => Object.assign(new Error(message), { code });

// Reopening data never connects a device or resumes recording automatically.
export function restoreSession({ store, monitor = undefined, activityPolicy = undefined, newlyCreated = false, now = () => Date.now() }) {
  const saved = store.getState();
  if (!saved.writable || saved.source === 'import' || saved.runStatus === 'complete') return null;
  if (newlyCreated || saved.sampleCount === 0 || saved.runStatus === 'paused') {
    if (saved.sampleCount === 0 && saved.runStatus === 'interrupted') store.updateRun({ status: 'open' });
    return createSession({ store, monitor, activityPolicy });
  }
  if (saved.runStatus !== 'interrupted') {
    store.updateRun({ status: 'interrupted' });
    store.appendEvent({ type: 'interrupted', receivedAt: now(), payload: {}, source: 'system' });
  }
  return null;
}

export function createSession({ store, monitor = undefined, activityPolicy = undefined,
  clock = { utc: () => Date.now(), mono: () => performance.now() }, config = undefined, capture = undefined, newlyCreated = false }) {
  const initial = store.getSnapshot();
  const settings = config ?? initial.run.context?.connectionPolicy ?? {};
  monitor ??= createReceptionMonitor(settings);
  capture ??= createPointCapture({ config: settings, clock });
  const pointMode = initial.run.recordingMode === 'point';
  let state = initial.run.status === 'complete' ? 'ended'
    : !newlyCreated && (initial.run.status === 'paused' || initial.samples.length) ? 'paused' : 'preview';
  let sampleId = store.getState().lastSampleId, finishRequest = null, endEventRecorded = false, lastInput = null, reception = 'waiting', problem = '';
  const stamp = () => ({ receivedAt: clock.utc(), monotonicAt: clock.mono() });
  const event = (type, payload = {}, source = 'system', at = stamp()) =>
    store.appendEvent({ receivedAt: at.receivedAt, type, payload, source });
  function assertRecordingAllowed() {
    const storage = store.getState();
    if (!storage.writable || storage.temporary || (storage.source === 'import' && !canResumeImportedRun(initial.run))) throw fail('read-only', '이 실험에는 새 측정값을 기록할 수 없어요.');
    if (storage.status === 'error') throw fail('storage-error', '저장 오류를 해결한 뒤 기록을 재개해 주세요.');
  }
  function resetContinuity() { lastInput = null; reception = 'waiting'; monitor.disconnected(); capture.disconnected(); }
  function observe(at = stamp()) {
    const observed = monitor.getSnapshot(at.monotonicAt).reception;
    const next = observed.ready ? 'receiving' : observed.state === 'stale' || reception !== 'waiting' ? 'stale' : 'waiting';
    if (next !== reception) {
      reception = next;
      if (state === 'recording') event('reception-change', { state: next, ruleId: 'reception', ruleVersion: 1, evidence: observed }, 'system', at);
    }
  }
  function start() {
    if (state === 'recording') return false;
    if (state !== 'preview') throw fail('recording-state', '현재 기록 상태에서는 새 기록을 시작할 수 없어요.');
    assertRecordingAllowed();
    event('recording-start', {}, 'user'); store.updateRun({ status: 'open' });
    state = 'recording'; problem = ''; return true;
  }
  function autoPause(reason) {
    state = 'paused'; problem = reason;
    event('recording-paused', { reason }, 'system'); store.updateRun({ status: 'paused' });
  }
  function acceptInput(input) {
    if (!input || !['reading', 'parse-error'].includes(input.type) || !Number.isFinite(input.receivedAt)
      || !Number.isFinite(input.monotonicAt)) throw fail('invalid-input', '수신값의 형식과 시각을 확인해 주세요.');
    // Preparation and paused reception are bounded previews, never retroactive samples.
    monitor.accept(input);
    if (state !== 'paused') capture.accept(input);
    if (state !== 'recording') { observe(input); return false; }
    if (store.getState().status === 'error') { autoPause('storage-error'); return false; }
    const reason = discontinuityReason(lastInput, input, settings.staleMs ?? Number.MAX_SAFE_INTEGER);
    try {
      if (reason) event('discontinuity', { reason }, 'system', input);
      if (input.type === 'reading' && !pointMode) {
        const record = { sampleId: sampleId + 1, receivedAt: input.receivedAt,
          values: input.values, validity: input.validity };
        if (input.rawExtra !== undefined) record.rawExtra = input.rawExtra;
        store.appendSample(record); sampleId++; capture.recorded(sampleId);
      } else if (input.type === 'parse-error') event('parse-error', { reasonCode: input.reasonCode }, 'system', input);
      observe(input); lastInput = input;
      return true;
    } catch (error) {
      if (['file-budget', 'sample-limit'].includes(error.code)) { autoPause(error.code); return false; }
      throw error;
    }
  }
  function captureStatus(connection) {
    if (state === 'paused' && store.getState().status === 'error') return { ready: false, reason: 'capture-storage' };
    if (state !== 'recording') return { ready: false, reason: 'capture-' + state };
    const saved = store.getState();
    if (!saved.writable || saved.temporary) return { ready: false, reason: 'capture-read-only' };
    if (saved.status === 'error') return { ready: false, reason: 'capture-storage' };
    return capture.status(connection, !pointMode);
  }
  function capturePoint(connection, manualValues) {
    assertRecordingAllowed();
    if (state !== 'recording') throw fail('capture-' + state, '기록을 재개한 뒤 한 점을 기록하세요.');
    const request = capture.prepare(connection, manualValues);
    try {
      if (!pointMode && request.sampleId === null) throw fail('capture-reception', '새 원자료 수신을 기다리세요.');
      const id = store.appendPointRecord({ ...request.point, capturedSampleId: pointMode ? sampleId + 1 : request.sampleId },
        pointMode ? { ...request.sample, sampleId: sampleId + 1 } : null);
      if (pointMode) sampleId++;
      request.accept(); return id;
    } catch (error) {
      request.cancel();
      if (['file-budget', 'sample-limit', 'storage-error'].includes(error.code)) autoPause(error.code);
      throw error;
    }
  }
  function addMemo(note, receivedAt = clock.utc()) {
    if (!['recording', 'paused'].includes(state)) return false;
    if (typeof note !== 'string' || note.length > 500 || !note.trim() || !Number.isFinite(receivedAt)) throw fail('invalid-note', '메모는 1~500자로 입력하세요.');
    event('note', { note: note.trim() }, 'user', { ...stamp(), receivedAt }); return true;
  }
  function pause() {
    if (state !== 'recording') return Promise.resolve();
    state = 'paused'; event('recording-paused', {}, 'user'); store.updateRun({ status: 'paused' });
    return store.flush();
  }
  function resume() {
    if (state !== 'paused') return false;
    assertRecordingAllowed(); resetContinuity();
    event('recording-resumed', {}, 'user'); event('discontinuity', { reason: 'recording-resumed' });
    store.updateRun({ status: 'open' }); state = 'recording'; problem = ''; return true;
  }
  function finish() {
    if (state === 'ended') return Promise.resolve();
    if (finishRequest) return finishRequest;
    state = 'finishing';
    // A local admission failure may occur between the end event and metadata update.
    // Retry that remaining boundary without reopening input or duplicating the event.
    try {
      if (!endEventRecorded) { event('measurement-end', {}, 'user'); endEventRecorded = true; }
      if (store.getState().runStatus !== 'complete') store.updateRun({ status: 'complete' });
    } catch (error) { return Promise.reject(error); }
    finishRequest = store.flush().then(() => { state = 'ended'; }).finally(() => { finishRequest = null; });
    return finishRequest;
  }
  function startAdditional(confirmation) {
    if (state !== 'ended') throw fail('recording-state', '현재 측정을 마친 뒤 추가 측정을 시작해 주세요.');
    assertRecordingAllowed();
    if (store.getState().status !== 'clean') throw fail('pending-save', '기존 자료를 저장한 뒤 추가 측정을 시작해 주세요.');
    if (confirmation?.sameContext !== true) throw fail('additional-confirmation', '같은 센서·프로그램·활동인지 확인해 주세요.');
    const checked = activityPolicy?.validateAdditional?.(confirmation) ?? structuredClone(confirmation);
    resetContinuity(); endEventRecorded = false;
    event('additional-measurement', { ...checked, previousLastSampleId: sampleId }, 'user');
    store.updateRun({ status: 'open' }); state = 'recording'; problem = '';
  }
  return { start, acceptInput, capturePoint, captureStatus, addMemo, pause, resume, finish, startAdditional, monitor,
    tick() { if (state === 'recording' && store.getState().status === 'error') autoPause('storage-error'); observe(); },
    disconnected() { capture.disconnected(); monitor.disconnected(); observe(); lastInput = null; },
    useTemporary() { if (state === 'finishing') state = 'ended'; },
    getState: () => ({ state, recording: state === 'recording', sampleCount: sampleId, reception, problem }),
  };
}
