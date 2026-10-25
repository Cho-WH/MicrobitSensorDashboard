import test from 'node:test';
import assert from 'node:assert/strict';
import { createElapsedAxis } from '../../src/ui/elapsed-axis.js';

const labels = values => values.map(createElapsedAxis(values));

test('elapsed ticks include only needed units without wrapping at an hour or day', () => {
  assert.deepEqual(labels([0, 5, 10]), ['0초', '5초', '10초']);
  assert.deepEqual(labels([50, 60, 70]), ['50초', '1분 0초', '1분 10초']);
  assert.deepEqual(labels([0, 60, 120]), ['0분', '1분', '2분']);
  assert.deepEqual(labels([3540, 3600, 3660]), ['59분', '1시간 0분', '1시간 1분']);
  assert.deepEqual(labels([0, 3600, 86400, 90000]), ['0시간', '1시간', '24시간', '25시간']);
});

test('subsecond spacing and offset precision remain distinct with consistent decimals', () => {
  assert.deepEqual(labels([0, .1, .2]), ['0.0초', '0.1초', '0.2초']);
  assert.deepEqual(labels([0, .01]), ['0.00초', '0.01초']);
  assert.deepEqual(labels([59.999, 60]), ['59.999초', '1분 0.000초']);
  assert.deepEqual(labels([1.25, 2.25]), ['1.25초', '2.25초']);
});

test('recent-window and extended trend negatives use one sign, never negative zero', () => {
  assert.deepEqual(labels([-70, -60, -50, 0]), ['−1분 10초', '−1분 0초', '−50초', '0초']);
  assert.equal(createElapsedAxis([-1, 0])(-0), '0초');
});

test('empty, singleton and unsorted ticks are safe and do not mutate inputs', () => {
  assert.equal(createElapsedAxis()(NaN), '');
  assert.deepEqual(labels([1.123]), ['1.123초']);
  const ticks = [2, 1, 1], before = [...ticks];
  assert.deepEqual(labels(ticks), ['2초', '1초', '1초']);
  assert.deepEqual(ticks, before);
});
