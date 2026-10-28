import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNoteOnsets, getMaskedNoteIndices } from '../src/core/notation/scoreMasks.ts';

const notes = (...durations) => durations.map(durMultiplier => ({ durMultiplier }));

test('lookahead masks only notes already played', () => {
  const melody = notes(1, 1, 2, 0.5, 0.5);
  assert.deepEqual(getMaskedNoteIndices(melody, 0, 'lookahead', false), []);
  assert.deepEqual(getMaskedNoteIndices(melody, 3, 'lookahead', false), [0, 1, 2]);
  assert.deepEqual(getMaskedNoteIndices(melody, 4, 'lookahead', true), [0, 1, 2, 3]);
});

test('photo masking follows actual measure durations, not groups of four notes', () => {
  const melody = notes(2, 2, 0.5, 0.5, 1, 2);
  assert.deepEqual(getNoteOnsets(melody), [0, 8, 16, 18, 20, 24]);
  assert.deepEqual(getMaskedNoteIndices(melody, 1, 'photo', true), [0, 1]);
  assert.deepEqual(getMaskedNoteIndices(melody, 2, 'photo', true), [2, 3, 4, 5]);
  assert.deepEqual(getMaskedNoteIndices(melody, 2, 'photo', false), []);
});

test('cross-bar notes are masked in both measures when they overlap', () => {
  const melody = notes(2, 1, 2, 1);
  // Starts 0, 8, 12, 20, so the third note spans ticks 12..20.
  assert.deepEqual(getMaskedNoteIndices(melody, 2, 'photo', true), [0, 1, 2]);
  assert.deepEqual(getMaskedNoteIndices(melody, 3, 'photo', true), [2, 3]);
});

test('other modes and invalid note positions do not mask anything', () => {
  const melody = notes(1, 1);
  assert.deepEqual(getMaskedNoteIndices(melody, 0, 'none', true), []);
  assert.deepEqual(getMaskedNoteIndices(melody, -1, 'photo', true), []);
  assert.deepEqual(getMaskedNoteIndices(melody, 2, 'lookahead', true), []);
  assert.deepEqual(getMaskedNoteIndices([], 0, 'photo', true), []);
});

test('rejects unquantized durations', () => {
  assert.throws(() => getNoteOnsets(notes(0.33)), /sixteenth-note/);
});
