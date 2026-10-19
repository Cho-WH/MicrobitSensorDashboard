import { openRunStore } from '../../src/data/run-store.js';
import { getExperiment } from '../../src/catalog/index.js';

export const utc = 1700000000000;
export const timers = { setTimeout: () => 1, clearTimeout() {} };
export function locks() {
  const held = new Set();
  return { async request(name, _options, callback) {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
}
// Deterministic effect replacement. Transaction/conflict tests use real IndexedDB in browser/storage.js.
export function memoryRepository() {
  const records = new Map();
  return {
    async readSnapshot(id) { return structuredClone(records.get(id) ?? null); },
    async commitBatch(batch) {
      const { run, workspace } = structuredClone(batch), previous = records.get(run.id);
      if (batch.insertOnly && previous) throw new Error('existing run');
      const samples = new Map((previous?.samples ?? []).map(s => [s.sampleId, s]));
      const events = new Map((previous?.events ?? []).map(e => [e.eventId, e]));
      for (const s of batch.samples) samples.set(s.sampleId, structuredClone(s));
      for (const e of batch.events) events.set(e.eventId, structuredClone(e));
      records.set(run.id, { run, samples: [...samples.values()], events: [...events.values()], workspace: workspace ?? previous?.workspace ?? null });
      return { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId, runRevision: run.runRevision,
        workspaceRevision: workspace?.workspaceRevision ?? null };
    },
    async deleteRun(id) { records.delete(id); },
  };
}
export const sample = (sampleId, changes = {}) => ({ sampleId, receivedAt: utc + sampleId * 100,
  values: { temperatureC: 25, pressureHpa: 1000 }, validity: { temperatureC: 'valid', pressureHpa: 'valid' }, ...changes });
export const reading = (ms, changes = {}) => ({ type: 'reading', receivedAt: utc + ms, monotonicAt: ms, attemptId: 1,
  values: { temperatureC: 25, pressureHpa: 1000 }, validity: { temperatureC: 'valid', pressureHpa: 'valid' }, ...changes });
export async function fixture(extra = {}) {
  const repository = extra.repository ?? memoryRepository(), lockManager = extra.locks ?? locks();
  const store = await openRunStore({ repository, id: 'test', create: true, context: getExperiment(), source: 'replay',
    timers, locks: lockManager, now: () => utc, ...extra });
  return { repository, store, lockManager };
}
