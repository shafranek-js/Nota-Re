import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNT_IN_BEATS, countInBeatDurationMs, countInFinished, countInIndex } from '../src/core/training/countInTiming.ts';

test('count-in is four quarter beats and independent of exercise time signature', () => {
  assert.equal(COUNT_IN_BEATS, 4);
  assert.equal(countInBeatDurationMs(60), 1000);
  assert.equal(countInBeatDurationMs(120), 500);
  assert.equal(countInIndex(0, 60), 1);
  assert.equal(countInIndex(1050, 60), 2);
  assert.equal(countInIndex(3500, 60), 4);
  assert.equal(countInFinished(3999, 60), false);
  assert.equal(countInFinished(4000, 60), true);
});

test('invalid tempo and clock input cannot create silent bogus pulses', () => {
  assert.throws(() => countInBeatDurationMs(0), /positive/);
  assert.throws(() => countInBeatDurationMs(NaN), /positive/);
  assert.equal(countInIndex(NaN, 80), 0);
});
