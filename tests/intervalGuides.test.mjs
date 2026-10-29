import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIntervalGuides } from '../src/core/notation/intervalGuides.ts';

test('interval guides use diatonic steps, not semitone distances or SVG coordinates', () => {
  const treble = stepIdx => ({ clef: 'treble', stepIdx });
  assert.deepEqual(getIntervalGuides([treble(0), treble(1), treble(3), treble(3)]), [
    { fromIndex: 0, toIndex: 1, steps: 2, symmetric: false },
    { fromIndex: 1, toIndex: 2, steps: 3, symmetric: true },
    { fromIndex: 2, toIndex: 3, steps: 1, symmetric: true }
  ]);
});

test('does not draw misleading interval arcs between two different clefs', () => {
  assert.deepEqual(getIntervalGuides([
    { clef: 'bass', stepIdx: 5 },
    { clef: 'treble', stepIdx: 6 },
    { clef: 'treble', stepIdx: 8 }
  ]), [
    { fromIndex: 1, toIndex: 2, steps: 3, symmetric: true }
  ]);
});

test('empty, singleton and invalid staff steps do not create guides', () => {
  assert.deepEqual(getIntervalGuides([]), []);
  assert.deepEqual(getIntervalGuides([{ clef: 'bass', stepIdx: 4 }]), []);
  assert.deepEqual(getIntervalGuides([
    { clef: 'bass', stepIdx: 2.5 }, { clef: 'bass', stepIdx: 4 }
  ]), []);
});
