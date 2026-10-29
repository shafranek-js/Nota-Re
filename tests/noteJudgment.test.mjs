import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeExerciseNote } from '../src/core/training/noteJudgment.ts';
import { MIDI_NOTE_MAP } from '../src/data/notes.ts';

test('F-major B-flat target accepts the same A-sharp black key, MIDI and onscreen input', () => {
  for (const [octave, midi] of [[3, 58], [4, 70], [5, 82]]) {
    assert.equal(MIDI_NOTE_MAP['Bb' + octave].midi, midi);
    assert.equal(MIDI_NOTE_MAP['A#' + octave].midi, midi);
    assert.equal(judgeExerciseNote(midi, 'Bb' + octave, false), 'correct');
    assert.equal(judgeExerciseNote(midi, 'A#' + octave, false), 'correct');
    assert.equal(judgeExerciseNote(midi, 'Bb' + octave, true), 'late');
    assert.equal(judgeExerciseNote(midi, 'A#' + octave, true), 'late');
  }
});

test('wrong note and invalid names are never credited, even when late', () => {
  assert.equal(judgeExerciseNote(70, 'B4', false), 'wrong-pitch');
  assert.equal(judgeExerciseNote(70, 'A4', true), 'wrong-pitch');
  assert.equal(judgeExerciseNote(70, 'Bb6', false), 'wrong-pitch');
  assert.equal(judgeExerciseNote(70, '__proto__', false), 'wrong-pitch');
});

test('C, G and D tonalities still judge equal enharmonic pitch rather than notation', () => {
  for (const midi of [48, 60, 62, 66, 70, 82]) {
    for (const [name, note] of Object.entries(MIDI_NOTE_MAP)) {
      if (note.midi === midi) assert.equal(judgeExerciseNote(midi, name, false), 'correct');
    }
  }
});
