import test from 'node:test';
import assert from 'node:assert/strict';
import { getExerciseEngravingKey } from '../src/core/notation/exerciseEngravingKey.ts';
import { advanceExerciseNoteStatuses } from '../src/core/training/assistedStep.ts';

const notes = () => [
  { id: 0, midi: 60, clef: 'treble', durMultiplier: 1, finger: 1, articulation: 'legato', syllable: 'ТА', status: 'current' },
  { id: 1, midi: 62, clef: 'treble', durMultiplier: 2, finger: 2, articulation: 'staccato', syllable: 'ТИ', status: 'pending' }
];

test('training-status snapshots must not re-engrave identical music', () => {
  const first = notes();
  const transitioned = advanceExerciseNoteStatuses(first, 0);
  assert.ok(transitioned);
  assert.notEqual(first, transitioned.notes);
  assert.deepEqual(first.map(n => n.status), ['current', 'pending']);
  assert.deepEqual(transitioned.notes.map(n => n.status), ['done', 'current']);
  assert.equal(getExerciseEngravingKey(first), getExerciseEngravingKey(transitioned.notes));
});

test('pitch, clef, duration, fingering, articulation and rhythm syllable change engraving identity', () => {
  const base = notes();
  const original = getExerciseEngravingKey(base);
  for (const edit of [
    { midi: 64 }, { clef: 'bass' }, { durMultiplier: 0.5 },
    { finger: 5 }, { articulation: 'staccato' }, { syllable: 'ТИ-ТИ' }
  ]) {
    const modified = [ { ...base[0], ...edit }, base[1] ];
    assert.notEqual(getExerciseEngravingKey(modified), original, JSON.stringify(edit));
  }
  assert.notEqual(getExerciseEngravingKey(base.slice(0, 1)), original);
});
