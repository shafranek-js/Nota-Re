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


import { getVerticalChordGuides } from '../src/core/notation/intervalGuides.ts';
import { createChordStudy } from '../src/core/training/chordStudy.ts';
import { createAccompanimentStudy } from '../src/core/training/accompanimentStudy.ts';

test('all three written triad inversions follow real simultaneous onsets, not a selected inversion label', () => {
  const expected = [
    { inversion: 0, figure: '5/3', bass: 'C', fragments: /основной тон.*терция и квинта/ },
    { inversion: 1, figure: '6', bass: 'E', fragments: /терция трезвучия.*терция и секста/ },
    { inversion: 2, figure: '6/4', bass: 'G', fragments: /квинта трезвучия.*кварта и секста/ }
  ];
  for (const row of expected) {
    const score = createChordStudy('C', 'major', row.inversion).score;
    const guides = getVerticalChordGuides(score.notes, score.fifths, 'reading');
    assert.equal(guides.length, 4);
    assert.deepEqual(guides.map(g => g.onsetTicks), [0, 4, 8, 12]);
    assert.ok(guides.every(g => g.inversion === row.inversion &&
      g.figure === row.figure && g.bass === row.bass && g.tonic === 'C' &&
      g.quality === 'major' && g.staff === 1 &&
      row.fragments.test(g.explanation)));
  }
});

test('relative minor qualities, written leading tones and real V to i chord transitions', () => {
  const natural = createChordStudy('D', 'minor', 1).score;
  const guides = getVerticalChordGuides(natural.notes, natural.fifths, 'reading');
  assert.equal(guides[0].tonic, 'B');
  assert.equal(guides[0].quality, 'minor');
  assert.equal(guides[0].figure, '6');

  for (const [key, leadingTone] of [['C','G♯'], ['G','D♯'], ['F','C♯'], ['D','A♯']]) {
    const study = createAccompanimentStudy(key, 'minor', 0, 'waltz', 'both', 0, 'harmonic');
    const result = getVerticalChordGuides(study.score.notes, study.score.fifths, 'reading');
    assert.equal(result.length, 2, 'RH V and i; LH dyads never masquerade as a triad');
    assert.equal(result[0].quality, 'major');
    assert.equal(result[0].staff, 1);
    assert.ok(result[0].pitchNames.includes(leadingTone), 'written raised leading tone');
    assert.equal(result[1].quality, 'minor');
    assert.equal(result[1].onsetTicks, study.score.beats * 4);
  }
});

test('do not combine sequential notes, cross-staff parts, dyads, or non-triad shapes', () => {
  const c = createChordStudy('C', 'major', 0).score;
  const notes = c.notes.slice(0, 3);
  assert.deepEqual(getVerticalChordGuides(notes.map((note, index) =>
    ({ ...note, onsetTicks: index * 4 })), c.fifths, 'reading'), []);
  assert.deepEqual(getVerticalChordGuides(notes.map((note, index) =>
    ({ ...note, staff: index === 2 ? 2 : 1 })), c.fifths, 'reading'), []);
  assert.deepEqual(getVerticalChordGuides(notes.slice(0, 2), c.fifths, 'reading'), []);
  assert.deepEqual(getVerticalChordGuides([
    notes[0], notes[1], { ...notes[2], midi: 66 }
  ], c.fifths, 'reading'), [], 'augmented or otherwise mis-spelled triads are not major/minor');
  assert.deepEqual(getVerticalChordGuides([
    ...notes, { ...notes[2], midi: 72 }
  ], c.fifths, 'reading'), [], 'extra note prevents overconfident triad identification');
});

test('explicit written spelling wins over a MIDI enharmonic guess; invalid spelling is rejected', () => {
  const notes = createChordStudy('C', 'major', 0).score.notes.slice(0, 3);
  const altered = notes.map(note => note.midi === 64
    ? { ...note, spelling: { step: 'F', alter: -1, octave: 4 } }
    : note);
  assert.deepEqual(getVerticalChordGuides(altered, 0, 'reading'), [],
    'F-flat is enharmonically E but is not a written third of C');
  assert.deepEqual(getVerticalChordGuides(notes.map(note => note.midi === 64
    ? { ...note, spelling: { step: 'E', alter: 1, octave: 4 } } : note), 0, 'reading'), [],
  'invalid written MIDI correspondence must not be silently corrected');
});

test('memory and official graded contexts never expose chord guide answers', () => {
  const notes = createChordStudy('C', 'major', 0).score.notes;
  assert.deepEqual(getVerticalChordGuides(notes, 0, 'memory'), []);
  assert.deepEqual(getVerticalChordGuides(notes, 0, 'graded'), []);
  assert.deepEqual(getVerticalChordGuides(notes, 8, 'reading'), []);
});
