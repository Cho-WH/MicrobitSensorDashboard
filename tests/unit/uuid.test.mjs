import test from 'node:test';
import assert from 'node:assert/strict';
import { createUuid } from '../../src/domain/uuid.js';

test('UUID uses native generation when available', () => {
  const source = { randomUUID() { assert.equal(this, source); return 'native-uuid'; }, getRandomValues() { assert.fail('unexpected fallback'); } };
  assert.equal(createUuid(source), 'native-uuid');
});

test('HTTP fallback keeps cryptographic bytes except the UUID v4 version and variant bits', () => {
  let calls=0;
  const source = { getRandomValues(bytes) { calls++; assert.equal(bytes.length,16); return bytes.fill(255); } };
  assert.equal(createUuid(source), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(calls,1);
  assert.throws(() => createUuid({ getRandomValues() { throw new Error('unavailable'); } }), /unavailable/);
});
