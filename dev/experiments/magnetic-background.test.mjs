import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundCapture, subtractBackground } from './magnetic-background.js';

const reading = (time, x = 15) => ({ type: 'reading', monotonicAt: time, receivedAt: 1000 + time,
  values: { magneticX: x, magneticY: -30, magneticZ: 0, magneticStrength: Math.hypot(x, -30, 0) },
  validity: { magneticX: 'valid', magneticY: 'valid', magneticZ: 'valid', magneticStrength: 'valid' } });

test('archived background capture rejects stale, incomplete or interrupted samples and averages each axis', () => {
  const capture = createBackgroundCapture();
  for (let i = 0; i < 9; i++) capture.add(reading(i * 100, i));
  assert.throws(() => capture.capture(800));
  capture.add(reading(900, 9));
  assert.deepEqual(capture.capture(900), { vector: [4.5, -30, 0], at: 1900 });
  assert.throws(() => capture.capture(3000));
  capture.add({ type: 'parse-error' });
  capture.add(reading(1000));
  assert.throws(() => capture.capture(1000));
  capture.reset();
  for (let i = 0; i < 10; i++) capture.add(reading(i * 10));
  assert.throws(() => capture.capture(90));
});

test('archived subtraction derives the vector magnitude, preserves source values and rejects invalid components', () => {
  const source = reading(0), snapshot = structuredClone(source);
  const derived = subtractBackground(source, { vector: [12, -26, 0] });
  assert.equal(derived.values.magneticStrength, 5);
  assert.deepEqual(source, snapshot);
  source.validity.magneticX = 'out-of-range';
  const invalid = subtractBackground(source, { vector: [12, -26, 0] });
  assert.equal(invalid.values.magneticStrength, null);
  assert.equal(invalid.validity.magneticX, 'out-of-range');
  assert.throws(() => subtractBackground(source, { vector: [0, NaN, 0] }));
});
