// Adapted from Cho-WH/bme280 59c5c149450f970bace2deaa183857c275595853,
// gay-lussac/data/repository.js. Atomic transactions and retry semantics retained.
import { DATABASE, withEventNote } from '../domain/contracts.js';
import { samePointOrigin, validatePointRecord } from '../domain/point-records.js';
import { upgradeRun, upgradeWorkspace } from './schema.js';

const STORES = ['runs', 'samples', 'events', 'workspaces', 'pointRecords'];
const conflict = (message) => Object.assign(new Error(message), { code: 'storage-conflict' });

// idb and its database objects never leave this adapter.
export function createRepository({ onUnavailable = (_message) => {}, databaseName = DATABASE.name } = {}) {
  let database, opening;
  async function open() {
    if (database) return;
    if (opening) return opening;
    if (!globalThis.indexedDB || !globalThis.idb?.openDB) {
      throw Object.assign(new Error('이 환경에서는 브라우저 저장소를 열 수 없습니다.'), { code: 'storage-unavailable' });
    }
    // Capture both a synchronous browser refusal and an asynchronous open failure.
    // Transactions after a successful open retain their original error and pending batch.
    opening = Promise.resolve().then(() => globalThis.idb.openDB(databaseName, DATABASE.version, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('runs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
          db.createObjectStore('samples', { keyPath: ['runId', 'sampleId'] }).createIndex('runId', 'runId');
          db.createObjectStore('events', { keyPath: ['runId', 'eventId'] }).createIndex('runId', 'runId');
          db.createObjectStore('workspaces', { keyPath: 'runId' });
        }
        if (oldVersion < 2) {
          const points = db.createObjectStore('pointRecords', { keyPath: ['runId', 'pointRecordId'] });
          points.createIndex('runId', 'runId');
          points.createIndex('capturedSample', ['runId', 'capturedSampleId'], { unique: true });
          // Cursor conversion bounds memory and keeps all changes inside the versionchange transaction.
          void (async () => {
            const conversions = { runs: upgradeRun, workspaces: upgradeWorkspace };
            for (const [name, convert] of Object.entries(conversions)) {
              let cursor = await transaction.objectStore(name).openCursor();
              while (cursor) { await cursor.update(convert(cursor.value)); cursor = await cursor.continue(); }
            }
          })().catch(() => transaction.abort());
        }
      },
      blocked() { onUnavailable('다른 탭을 닫은 뒤 저장소 열기를 다시 시도해 주세요.'); },
      blocking() { database?.close(); database = undefined; onUnavailable('저장소가 다른 탭에서 갱신되었습니다. 다시 열어 주세요.'); },
      terminated() { database = undefined; onUnavailable('브라우저 저장소 연결이 종료되었습니다.'); },
    })).then((db) => { database = db; }).catch((cause) => {
      throw Object.assign(new Error('브라우저 저장소를 열지 못했어요. 권한·저장 공간을 확인한 뒤 다시 시도해 주세요. 파일은 임시로 분석할 수 있어요.', { cause }), { code: 'storage-unavailable' });
    }).finally(() => { opening = undefined; });
    return opening;
  }
  async function read(store, key = undefined, index = undefined) {
    await open();
    if (index) return database.getAllFromIndex(store, index, key);
    return key === undefined ? database.getAll(store) : database.get(store, key);
  }
  async function readSnapshot(id) {
    await open();
    const tx = database.transaction(STORES);
    const [run, samples, events, workspace, pointRecords] = await Promise.all([
      tx.objectStore('runs').get(id), tx.objectStore('samples').index('runId').getAll(id),
      tx.objectStore('events').index('runId').getAll(id), tx.objectStore('workspaces').get(id),
      tx.objectStore('pointRecords').index('runId').getAll(id),
    ]);
    await tx.done;
    return run ? { run, samples, events, workspace: workspace ?? null, pointRecords } : null;
  }
  async function commitBatch({ run, samples, events, workspace, pointRecords = [], baseRunRevision, insertOnly = false }) {
    await open();
    const tx = database.transaction(STORES, 'readwrite');
    try {
      const previous = await tx.objectStore('runs').get(run.id);
      if (insertOnly && previous) throw conflict('같은 ID의 실험이 이미 있습니다. 새 실험으로 가져와 주세요.');
      const retry = (previous?.runRevision ?? 0) !== baseRunRevision;
      if (retry && !sameRecord(previous, run)) {
        throw conflict('다른 저장 내용과 충돌했어요. 이 탭의 자료를 전체 실험 JSON으로 보관해 주세요.');
      }
      if (!Number.isSafeInteger(run.runRevision) || run.runRevision <= baseRunRevision) {
        throw conflict('실험 저장 버전은 증가해야 합니다.');
      }
      if (previous && (run.lastSavedSampleId < previous.lastSavedSampleId || run.lastSavedEventId < previous.lastSavedEventId)) {
        throw conflict('이미 저장한 원자료의 범위를 줄일 수 없습니다.');
      }
      if (previous && (run.recordingMode !== previous.recordingMode || run.pointDataRevision < previous.pointDataRevision))
        throw conflict('기록 방식과 점 자료의 저장 버전은 되돌릴 수 없습니다.');
      for (const [name, records, key] of [['samples', samples, 'sampleId'], ['events', events, 'eventId']]) {
        const store = tx.objectStore(name);
        for (const record of records) {
          if (record.runId !== run.id) throw conflict('실험 ID가 일치하지 않습니다.');
          const existing = await store.get([run.id, record[key]]);
          if (retry && !sameRecord(existing, record)) throw conflict('재시도하는 저장 묶음이 원래 내용과 다릅니다.');
          if (existing && !sameRecord(existing, record)) {
            // Only user notes can change. Source values, times and automatic events cannot.
            if (name !== 'events' || retry || !sameRecord(withEventNote(existing, record.payload?.note), record)) {
              throw conflict('원자료 ID가 충돌했습니다. 원자료는 덮어쓰지 않습니다.');
            }
            await store.put(record);
          }
          if (!existing) await store.add(record);
        }
      }
      const pointStore = tx.objectStore('pointRecords');
      let pointCount = await pointStore.index('runId').count(run.id);
      for (const record of pointRecords) {
        const sample = await tx.objectStore('samples').get([run.id, record.capturedSampleId]);
        if (!sameRecord(validatePointRecord(record, run, sample), record)) throw conflict('점 기록의 형식을 확인하세요.');
        const existing = await pointStore.get([run.id, record.pointRecordId]);
        if (retry && !sameRecord(existing, record)) throw conflict('재시도하는 점 기록이 원래 내용과 다릅니다.');
        if (existing) {
          if (!samePointOrigin(existing, record) || (!sameRecord(existing, record) && record.revision <= existing.revision))
            throw conflict('점 기록의 원자료·시각을 바꾸거나 낡은 입력으로 덮어쓸 수 없습니다.');
          if (!sameRecord(existing, record)) await pointStore.put(record);
        } else {
          if (record.pointRecordId !== pointCount + 1) throw conflict('점 기록 번호는 순서대로 증가해야 합니다.');
          await pointStore.add(record); pointCount++;
        }
      }
      if ((run.recordingMode === 'point' && pointCount !== run.lastSavedSampleId)
        || (run.recordingMode === null && pointCount)) throw conflict('기록 방식에 맞는 원자료와 점 기록을 함께 저장해야 합니다.');
      if (workspace) {
        if (workspace.runId !== run.id || !Number.isSafeInteger(workspace.envelopeRevision)
          || workspace.envelopeRevision < 1 || !workspace.bySource?.[workspace.activeSourceId]) throw conflict('분석 작업의 실험 ID·자료 선택·저장 버전을 확인하세요.');
        const oldWorkspace = await tx.objectStore('workspaces').get(run.id);
        if (retry && !sameRecord(oldWorkspace, workspace)) throw conflict('재시도하는 분석 작업이 원래 내용과 다릅니다.');
        if (!retry && oldWorkspace && workspace.envelopeRevision <= oldWorkspace.envelopeRevision) {
          throw conflict('분석 작업 버전은 증가해야 합니다.');
        }
        for (const [sourceId, state] of Object.entries(oldWorkspace?.bySource ?? {})) {
          const next = workspace.bySource[sourceId];
          if (!next || next.workspaceRevision < state.workspaceRevision
            || (next.workspaceRevision === state.workspaceRevision && !sameRecord(next, state)))
            throw conflict('다른 자료의 분석 상태를 낡은 사본으로 덮어쓸 수 없습니다.');
        }
        await tx.objectStore('workspaces').put(workspace);
      }
      await tx.objectStore('runs').put(run);
      await tx.done;
      return { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId,
        runRevision: run.runRevision, envelopeRevision: workspace?.envelopeRevision ?? null };
    } catch (error) {
      try { tx.abort(); } catch { /* The request may already have aborted it. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  return {
    open, readSnapshot, commitBatch,
    async deleteRun(id) {
      await open();
      const tx = database.transaction(STORES, 'readwrite');
      try {
        for (const name of ['samples', 'events', 'pointRecords']) {
          let cursor = await tx.objectStore(name).index('runId').openCursor(id);
          while (cursor) { await cursor.delete(); cursor = await cursor.continue(); }
        }
        await tx.objectStore('workspaces').delete(id);
        await tx.objectStore('runs').delete(id);
        await tx.done;
      } catch (error) {
        try { tx.abort(); } catch { /* Already aborted. */ }
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async listRuns() { return (await read('runs')).sort((a, b) => b.updatedAt - a.updatedAt); },
    readRun: (id) => read('runs', id),
    readSamples: (id) => read('samples', id, 'runId'),
    readEvents: (id) => read('events', id, 'runId'),
    readPointRecords: (id) => read('pointRecords', id, 'runId'),
    readWorkspace: (id) => read('workspaces', id),
    close() { database?.close(); database = undefined; },
  };
}

function sameRecord(a, b) {
  const canonical = (value) => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical)
      : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
