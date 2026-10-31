// Page-local storage for the tour. RunStore still owns admission, revisions and drafts.
// No IndexedDB, browser permissions or cross-tab state are involved.
export function createTourRepository() {
  const records = new Map(), held = new Set();
  const copy = structuredClone;
  const snapshot = id => copy(records.get(id) ?? null);
  return {
    volatile: true,
    locks: { async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({name}); } finally { held.delete(name); }
    } },
    async open() {},
    async readSnapshot(id) { return snapshot(id); },
    async listRuns() { return [...records.values()].map(item => copy(item.run)).sort((a,b)=>b.updatedAt-a.updatedAt); },
    async commitBatch(batch) {
      const next = copy(batch), previous = records.get(next.run.id);
      if ((next.insertOnly && previous) || (previous?.run.runRevision ?? 0) !== next.baseRunRevision)
        throw new Error('현재 기록의 저장 상태를 다시 확인해 주세요.');
      const merged = {run:next.run, workspace:next.workspace ?? previous?.workspace ?? null};
      for (const [kind,key] of [['samples','sampleId'],['events','eventId'],['pointRecords','pointRecordId']]) {
        const rows = new Map((previous?.[kind] ?? []).map(row=>[row[key],row]));
        for (const row of next[kind] ?? []) rows.set(row[key],row);
        merged[kind] = [...rows.values()];
      }
      records.set(next.run.id,merged);
      return {sampleId:next.run.lastSavedSampleId,eventId:next.run.lastSavedEventId,
        runRevision:next.run.runRevision,envelopeRevision:merged.workspace?.envelopeRevision ?? null};
    },
    async deleteRun(id) { records.delete(id); },
    close() { records.clear(); },
  };
}
