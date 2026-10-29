import test from 'node:test';
import assert from 'node:assert/strict';
import { resetNotesForRetry } from '../src/core/training/trainerSession.ts';

test('retry resets statuses without regenerating or mutating the finished score', () => {
  const notes = [
    { id: 1, noteName: 'C4', status: 'done', durMultiplier: 1 },
    { id: 2, noteName: 'D4', status: 'missed', durMultiplier: 0.5 },
    { id: 3, noteName: 'E4', status: 'done', durMultiplier: 2 }
  ];
  const next = resetNotesForRetry(notes);
  assert.notEqual(next, notes);
  assert.deepEqual(next.map(n => n.status), ['current', 'pending', 'pending']);
  assert.deepEqual(next.map(n => n.noteName), ['C4', 'D4', 'E4']);
  assert.deepEqual(notes.map(n => n.status), ['done', 'missed', 'done']);
  assert.notEqual(next[0], notes[0]);
});

test('empty note sequence stays empty (no invented first note)', () => {
  assert.deepEqual(resetNotesForRetry([]), []);
});
