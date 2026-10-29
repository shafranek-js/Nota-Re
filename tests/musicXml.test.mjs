import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreFromExercise, toMusicXml } from '../src/core/notation/musicXml.ts';

const note = (midi, clef = 'treble', durMultiplier = 1, extra = {}) => ({
  midi, clef, durMultiplier, ...extra
});

function measureVoices(xml) {
  const measures = Array.from(xml.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g),
    match => match[1]);
  return measures.map(measure => {
    const [upper, lower] = measure.split('<backup><duration>16</duration></backup>');
    assert.ok(lower !== undefined, 'expected two staff voices');
    const sum = fragment => Array.from(fragment.matchAll(/<note>[\s\S]*?<duration>(\d+)<\/duration>[\s\S]*?<\/note>/g))
      .reduce((total, match) => total + Number(match[1]), 0);
    return [sum(upper), sum(lower)];
  });
}

test('writes a complete piano score with valid 4/4 voices', () => {
  const score = createScoreFromExercise([
    note(60), note(62), note(64), note(65)
  ], 'C');
  const xml = toMusicXml(score);
  assert.match(xml, /<score-partwise version="4.0">/);
  assert.match(xml, /<clef number="1"><sign>G<\/sign><line>2<\/line><\/clef>/);
  assert.match(xml, /<clef number="2"><sign>F<\/sign><line>4<\/line><\/clef>/);
  assert.deepEqual(measureVoices(xml), [[16, 16]]);
});

test('supports mixed eighth, sixteenth and half durations', () => {
  const score = createScoreFromExercise([
    note(60, 'treble', 1),
    note(62, 'treble', 0.5),
    note(64, 'treble', 0.25),
    note(65, 'treble', 2),
    note(67, 'treble', 0.25)
  ], 'G');
  const xml = toMusicXml(score);
  assert.match(xml, /<key><fifths>1<\/fifths><\/key>/);
  assert.match(xml, /<type>16th<\/type>/);
  assert.match(xml, /<type>eighth<\/type>/);
  assert.match(xml, /<type>half<\/type>/);
  assert.deepEqual(measureVoices(xml), [[16, 16]]);
});

test('keeps both staves aligned and inserts rests for inactive hand', () => {
  const score = createScoreFromExercise([
    note(48, 'bass'),
    note(60, 'treble'),
    note(62, 'treble'),
    note(64, 'treble')
  ], 'C');
  const xml = toMusicXml(score);
  assert.match(xml, /<pitch><step>C<\/step><octave>3<\/octave><\/pitch>/);
  assert.match(xml, /<voice>2<\/voice>/);
  assert.match(xml, /<voice>1<\/voice>/);
  assert.ok((xml.match(/<rest\/>/g) || []).length >= 2);
  assert.deepEqual(measureVoices(xml), [[16, 16]]);
});

test('spells Bb rather than A# under an F major key signature', () => {
  const xml = toMusicXml(createScoreFromExercise([note(70)], 'F'));
  assert.match(xml, /<key><fifths>-1<\/fifths><\/key>/);
  assert.match(xml, /<pitch><step>B<\/step><alter>-1<\/alter><octave>4<\/octave><\/pitch>/);
});

test('splits notes at barlines using ties', () => {
  const xml = toMusicXml(createScoreFromExercise([
    note(60), note(62), note(64), note(65, 'treble', 2)
  ], 'C'));
  assert.deepEqual(measureVoices(xml), [[16, 16], [16, 16]]);
  assert.match(xml, /<tie type="start"\/>/);
  assert.match(xml, /<tie type="stop"\/>/);
  assert.match(xml, /<tied type="start"\/>/);
  assert.match(xml, /<tied type="stop"\/>/);
});

test('escapes metadata and syllables and includes pedagogical annotations on request', () => {
  const score = createScoreFromExercise([
    note(60, 'treble', 1, { articulation: 'staccato', finger: 3, syllable: 'Ти & <Та>' })
  ], 'D', 'Sight-reading <A&B>');
  const xml = toMusicXml(score, { includeFingering: true, includeSyllables: true });
  assert.match(xml, /Sight-reading &lt;A&amp;B&gt;/);
  assert.match(xml, /<fingering>3<\/fingering>/);
  assert.match(xml, /<staccato\/>/);
  assert.match(xml, /Ти &amp; &lt;Та&gt;/);
});

test('rejects empty scores and non-quantized durations', () => {
  assert.throws(() => createScoreFromExercise([], 'C'), /empty exercise/);
  assert.throws(() => createScoreFromExercise([note(60, 'treble', 0.33)], 'C'), /sixteenth/);
  assert.throws(() => createScoreFromExercise([note(140)], 'C'), /MIDI pitch/);
});


test('serializes a same-staff chord without advancing time twice', () => {
  const score = createScoreFromExercise([note(60)], 'C');
  const chordScore = {
    ...score,
    notes: [
      { midi: 60, staff: 1, onsetTicks: 0, durationTicks: 4 },
      { midi: 64, staff: 1, onsetTicks: 0, durationTicks: 4 },
      { midi: 67, staff: 1, onsetTicks: 0, durationTicks: 4 },
      { midi: 69, staff: 1, onsetTicks: 4, durationTicks: 12 },
      { midi: 48, staff: 2, onsetTicks: 0, durationTicks: 16 }
    ]
  };
  const xml = toMusicXml(chordScore);
  assert.equal((xml.match(/<chord\/>/g) || []).length, 2);
  assert.match(xml, /<note><chord\/><pitch><step>E<\/step>/);
  assert.match(xml, /<note><chord\/><pitch><step>G<\/step>/);
  assert.ok(xml.includes('<backup><duration>16</duration></backup>'));
  assert.match(xml, /<voice>2<\/voice>/);
});

test('keeps chord members aligned across a barline and split durations', () => {
  const score = {
    ...createScoreFromExercise([note(60)], 'C'),
    notes: [
      { midi: 60, staff: 1, onsetTicks: 12, durationTicks: 10 },
      { midi: 64, staff: 1, onsetTicks: 12, durationTicks: 10 }
    ]
  };
  const xml = toMusicXml(score);
  assert.equal((xml.match(/<chord\/>/g) || []).length, 3);
  assert.equal((xml.match(/<tie type="start"\/>/g) || []).length, 4);
  assert.equal((xml.match(/<tie type="stop"\/>/g) || []).length, 4);
});

test('rejects unequal simultaneous same-staff durations rather than producing invalid chords', () => {
  const score = {
    ...createScoreFromExercise([note(60)], 'C'),
    notes: [
      { midi: 60, staff: 1, onsetTicks: 0, durationTicks: 4 },
      { midi: 64, staff: 1, onsetTicks: 0, durationTicks: 8 }
    ]
  };
  assert.throws(() => toMusicXml(score), /share a duration/);
});
