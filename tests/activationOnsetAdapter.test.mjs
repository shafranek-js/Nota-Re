import test from 'node:test';
import assert from 'node:assert/strict';
import { activationFramesToOnsets } from '../src/core/audio/activationOnsetAdapter.ts';

const frame = (ms, notes) => ({
  time: ms / 1000,
  notes: notes.map(([midi, prob = 0.8]) => ({ midi, prob }))
});

test('one sustained activation emits one estimated note onset', () => {
  const result = activationFramesToOnsets([
    frame(0, [[60]]), frame(12, [[60]]), frame(24, [[60]])
  ]);
  assert.deepEqual(result, [{ midi: 60, onsetMs: 0, confidence: 0.8 }]);
});

test('chord members and octave ghosts are retained for the evaluator to judge', () => {
  const result = activationFramesToOnsets([
    frame(0, [[48], [60], [64]]), frame(12, [[48], [60], [64]])
  ]);
  assert.deepEqual(result.map(x => x.midi), [48, 60, 64]);
});

test('short inactive flicker does not generate fake repeated attacks', () => {
  const result = activationFramesToOnsets([
    frame(0, [[60]]), frame(10, [[60]]), frame(20, []),
    frame(40, [[60]]), frame(50, [[60]])
  ]);
  assert.equal(result.length, 1);
});

test('a meaningful inactive gap can rearm the same pitch', () => {
  const result = activationFramesToOnsets([
    frame(0, [[60]]), frame(10, [[60]]), frame(20, []),
    frame(80, []), frame(100, [[60]]), frame(110, [[60]])
  ]);
  assert.deepEqual(result.map(x => x.onsetMs), [0, 100]);
});

test('a repeated strike with no silent gap remains unresolved, not fabricated', () => {
  const result = activationFramesToOnsets(
    Array.from({ length: 20 }, (_, i) => frame(i * 12, [[60]]))
  );
  assert.equal(result.length, 1);
});

test('bad times, MIDI notes and options fail closed', () => {
  assert.throws(() => activationFramesToOnsets([frame(10, [[60]]), frame(10, [[60]])]), /Invalid/);
  assert.throws(() => activationFramesToOnsets([frame(0, [[109]])]), /Invalid/);
  assert.throws(() => activationFramesToOnsets([], { minObservedFrames: 0 }), /Invalid/);
});
