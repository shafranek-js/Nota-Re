import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASS_LANDMARKS, getBassLandmarkSegments } from '../src/core/notation/bassLandmarks.ts';

test('F3 and G2 are actual lines on a bass clef, counted from top', () => {
  assert.deepEqual(BASS_LANDMARKS.map(({ pitch, lineFromTop }) => [pitch, lineFromTop]), [
    ['F3', 1], ['G2', 4]
  ]);
});

test('landmarks track the staff geometry instead of a fixed SVG y value', () => {
  const segments = getBassLandmarkSegments({
    x: 88,
    width: 400,
    lineY: index => 150 + index * 12
  });
  assert.deepEqual(segments.map(({ pitch, x1, x2, y }) => [pitch, x1, x2, y]), [
    ['F3', 88, 488, 162],
    ['G2', 88, 488, 198]
  ]);
});

test('missing or nonfinite stave geometry never generates bogus lines', () => {
  assert.deepEqual(getBassLandmarkSegments({ x: NaN, width: 400, lineY: () => 40 }), []);
  assert.deepEqual(getBassLandmarkSegments({ x: 50, width: 0, lineY: () => 40 }), []);
  assert.deepEqual(getBassLandmarkSegments({ x: 50, width: 300, lineY: () => NaN }), []);
});
