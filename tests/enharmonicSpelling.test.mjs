import test from 'node:test';
import assert from 'node:assert/strict';
import { MIDI_NOTE_MAP, BLACK_KEYS_ORDER } from '../src/data/notes.ts';
import { applyTonalityToPitch, generateExerciseNotes } from '../src/core/generator/ExerciseGenerator.ts';
import { createScoreFromExercise, toMusicXml } from '../src/core/notation/musicXml.ts';

test('F major spells the flattened seventh scale degree as Bb in all octaves', () => {
  for (const octave of [3, 4, 5]) {
    assert.equal(applyTonalityToPitch('B' + octave, 'F'), 'Bb' + octave);
    const flat = MIDI_NOTE_MAP['Bb' + octave];
    const sharp = MIDI_NOTE_MAP['A#' + octave];
    assert.ok(flat && sharp);
    assert.equal(flat.midi, 58 + (octave - 3) * 12);
    assert.equal(flat.midi, sharp.midi, 'no pitch/keyboard remapping');
    assert.equal(flat.freq, sharp.freq);
    assert.equal(flat.accidental, 'flat');
  }
  assert.equal(applyTonalityToPitch('B4', 'G'), 'B4');
  assert.equal(applyTonalityToPitch('B4', 'C'), 'B4');
  assert.equal(applyTonalityToPitch('B4', 'D'), 'B4');
  assert.equal(applyTonalityToPitch('F4', 'G'), 'F#4');
  assert.equal(applyTonalityToPitch('C4', 'D'), 'C#4');
  assert.ok(BLACK_KEYS_ORDER.includes('A#4'), 'physical 3-octave keyboard retains its key');
});

test('F major generated treble and bass scores keep correct MIDI and MusicXML', () => {
  for (const filter of ['treble_oct2', 'bass']) {
    const options = { mode: 'reflex', filter, tonality: 'F', scoreNoteCount: 16, hanonType: 'hanon1' };
    // Generate many runs because the sight-reading exercise is randomized.
    const flatNotes = Array.from({ length: 80 }, () => generateExerciseNotes(options))
      .flat().filter(n => n.midi === (filter === 'bass' ? 58 : 70));
    assert.ok(flatNotes.length > 0, 'random pool must include lowered B');
    assert.ok(flatNotes.every(n => n.noteName === (filter === 'bass' ? 'Bb3' : 'Bb4')));
    assert.ok(flatNotes.every(n => n.accidental === 'flat'));
    const xml = toMusicXml(createScoreFromExercise(
      flatNotes.slice(0, 1).map(n => ({ midi: n.midi, clef: n.clef, durMultiplier: 1 })),
      'F'
    ));
    assert.match(xml, /<pitch><step>B<\/step><alter>-1<\/alter><octave>[34]<\/octave><\/pitch>/);
    assert.doesNotMatch(xml, /<pitch><step>A<\/step><alter>1<\/alter>/);
  }
});
