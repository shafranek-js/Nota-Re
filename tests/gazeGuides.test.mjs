import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGazeGuides } from '../src/core/notation/gazeGuides.ts';

const b = duration => ({ clef: 'bass', durMultiplier: duration });
const t = duration => ({ clef: 'treble', durMultiplier: duration });

test('builds a bass-to-treble gaze guide once per actual 4/4 measure', () => {
  const notes = [b(1), t(1), t(1), t(1), b(1), t(1), t(1), t(1)];
  assert.deepEqual(getGazeGuides(notes), [
    { fromIndex: 0, toIndex: 1, measure: 1 },
    { fromIndex: 4, toIndex: 5, measure: 2 }
  ]);
});

test('uses rhythmic onsets rather than assuming four notes per measure', () => {
  const notes = [
    b(2), t(0.5), t(0.5), t(1),
    b(0.5), b(0.5), t(3)
  ];
  assert.deepEqual(getGazeGuides(notes), [
    { fromIndex: 0, toIndex: 1, measure: 1 },
    { fromIndex: 4, toIndex: 6, measure: 2 }
  ]);
});

test('skips downbeats without a later treble note in the measure', () => {
  assert.deepEqual(getGazeGuides([b(4), b(4), t(1)]), []);
  assert.deepEqual(getGazeGuides([t(1), b(1), t(1)]), []);
  assert.deepEqual(getGazeGuides([]), []);
  assert.deepEqual(getGazeGuides([b(1)]), []);
});

test('rejects unquantized durations instead of drawing wrong measure guides', () => {
  assert.throws(() => getGazeGuides([b(0.3), t(1)]), /sixteenth/);
});
