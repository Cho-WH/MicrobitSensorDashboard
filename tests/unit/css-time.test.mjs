import test from 'node:test';
import assert from 'node:assert/strict';
import { cssTimeMilliseconds } from '../../src/ui/css-time.js';

test('CSS seconds and milliseconds preserve the same time for JS APIs', () => {
  for (const [seconds, milliseconds, expected] of [
    ['.125s', '125ms', 125], ['1.5s', '1500ms', 1500],
    ['.0005s', '.5ms', .5], ['-0.25s', '-250ms', -250],
  ]) {
    assert.equal(cssTimeMilliseconds(seconds), expected);
    assert.equal(cssTimeMilliseconds(milliseconds), expected);
  }
});

test('zero times and whitespace remain valid', () => {
  for (const value of ['0s', '0ms', ' 0.0s ']) assert.equal(cssTimeMilliseconds(value), 0);
});

test('missing or invalid CSS times do not pass NaN to animation APIs', () => {
  for (const value of ['', 'auto', '125', '125junkms', '1s, 2s', '1e999s'])
    assert.equal(cssTimeMilliseconds(value), 0);
});
