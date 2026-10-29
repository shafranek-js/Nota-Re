import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceExerciseNoteStatuses } from '../src/core/training/assistedStep.ts';

function sample() {
  return [
    { id: 0, status: 'current', noteName: 'C4' },
    { id: 1, status: 'pending', noteName: 'D4' },
    { id: 2, status: 'pending', noteName: 'E4' }
  ];
}

test('assisted step replaces only changed notes, without mutating frozen input', () => {
  const notes = sample();
  for (const item of notes) Object.freeze(item);
  Object.freeze(notes);
  const next = advanceExerciseNoteStatuses(notes, 0);
  assert.ok(next);
  assert.notEqual(next.notes, notes);
  assert.deepEqual(next.notes.map(n => n.status), ['done', 'current', 'pending']);
  assert.deepEqual(notes.map(n => n.status), ['current', 'pending', 'pending']);
  assert.notEqual(next.notes[0], notes[0]);
  assert.notEqual(next.notes[1], notes[1]);
  assert.equal(next.notes[2], notes[2], 'untouched note retains reference');
  assert.equal(next.finished, false);
  assert.equal(next.nextIndex, 1);
});

test('final assisted note is committed in a new array before regeneration timer', () => {
  const first = advanceExerciseNoteStatuses(sample(), 0);
  const second = advanceExerciseNoteStatuses(first.notes, 1);
  const third = advanceExerciseNoteStatuses(second.notes, 2);
  assert.equal(third.finished, true);
  assert.equal(third.nextIndex, 3);
  assert.deepEqual(third.notes.map(n => n.status), ['done', 'done', 'done']);
  assert.equal(second.notes[2].status, 'current');
  assert.notEqual(third.notes, second.notes, 'timer must compare the new state snapshot');
  assert.ok(third.notes.every(n => n.status !== 'current'));
});

test('out-of-range and malformed indices are safe no-ops, not free answers', () => {
  for (const index of [-1, 3, 1.1, NaN, Infinity]) {
    assert.equal(advanceExerciseNoteStatuses(sample(), index), null);
  }
  assert.equal(advanceExerciseNoteStatuses([], 0), null);
});
