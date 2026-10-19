import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../../src/data/repository.js';

async function withDatabaseApi(api, check) {
  const oldIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const oldIdb = Object.getOwnPropertyDescriptor(globalThis, 'idb');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'idb', { configurable: true, value: api });
  try { await check(); }
  finally {
    if (oldIndexedDb) Object.defineProperty(globalThis, 'indexedDB', oldIndexedDb); else delete globalThis.indexedDB;
    if (oldIdb) Object.defineProperty(globalThis, 'idb', oldIdb); else delete globalThis.idb;
  }
}

for (const [name, asynchronous] of [['SecurityError', false], ['InvalidStateError', true]]) {
  test(`initial ${name} is classified for temporary analysis and a later open retries`, async () => {
    const refusal = new DOMException('browser refused storage', name);
    let calls = 0, closed = 0;
    await withDatabaseApi({ openDB() {
      calls++;
      if (calls === 1) {
        if (asynchronous) return Promise.reject(refusal);
        throw refusal;
      }
      return Promise.resolve({ close() { closed++; } });
    } }, async () => {
      const repository = createRepository();
      const attempts = await Promise.allSettled([repository.open(), repository.open()]);
      for (const result of attempts) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.code, 'storage-unavailable');
        assert.equal(result.reason.cause, refusal);
        assert.match(result.reason.message, /다시 시도/);
      }
      assert.equal(calls, 1, 'concurrent opening shares the same browser request');
      await repository.open();
      assert.equal(calls, 2, 'a rejected opening must not poison later retries');
      repository.close(); assert.equal(closed, 1);
    });
  });
}

test('a write transaction failure after opening retains its original error instead of temporary fallback classification', async () => {
  const failure = new DOMException('quota exhausted', 'QuotaExceededError');
  await withDatabaseApi({ openDB: async () => ({ transaction() { throw failure; }, close() {} }) }, async () => {
    const repository = createRepository(); await repository.open();
    await assert.rejects(repository.commitBatch({ run: { id: 'test' }, samples: [], events: [], workspace: null, baseRunRevision: 0 }), error => error === failure);
    assert.notEqual(failure.code, 'storage-unavailable');
    repository.close();
  });
});
