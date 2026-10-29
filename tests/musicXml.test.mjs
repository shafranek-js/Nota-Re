import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreFromExercise, createScoreFromHands, toMusicXml } from '../src/core/notation/musicXml.ts';

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
  assert.equal((xml.match(/<chord\/>/g) || []).length, 2);
  assert.equal((xml.match(/<tie type="start"\/>/g) || []).length, 2);
  assert.equal((xml.match(/<tie type="stop"\/>/g) || []).length, 2);
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


test('independent two-hand lines start together and advance on their own clocks', () => {
  const score = createScoreFromHands(
    [note(60, 'treble', 1), note(62, 'treble', 1), note(64, 'treble', 2)],
    [note(48, 'bass', 2), note(50, 'bass', 2)],
    'C'
  );
  assert.deepEqual(score.notes.map(n => [n.midi, n.staff, n.onsetTicks, n.durationTicks]), [
    [60, 1, 0, 4], [48, 2, 0, 8],
    [62, 1, 4, 4], [64, 1, 8, 8], [50, 2, 8, 8]
  ]);
  const xml = toMusicXml(score);
  assert.deepEqual(measureVoices(xml), [[16, 16]]);
  assert.match(xml, /<backup><duration>16<\/duration><\/backup>/);
});

test('independent hands can end at different times without losing measure balance', () => {
  const score = createScoreFromHands([note(72, 'treble', 1)], [
    note(48, 'bass', 2), note(50, 'bass', 2), note(52, 'bass', 2)
  ], 'F');
  const xml = toMusicXml(score);
  assert.deepEqual(measureVoices(xml), [[16, 16], [16, 16]]);
});

test('two-hand builder rejects empty and invalid input', () => {
  assert.throws(() => createScoreFromHands([], [], 'C'), /empty/);
  assert.throws(() => createScoreFromHands([note(140)], [], 'C'), /MIDI pitch/);
  assert.throws(() => createScoreFromHands([], [note(48, 'bass', 0.33)], 'C'), /sixteenth/);
});

test('OSMD hides only empty-hand filler rests, while keeping music time intact', () => {
  const score = createScoreFromExercise([note(60), note(62), note(64), note(65)], 'C');
  const normal = toMusicXml(score);
  const display = toMusicXml(score, { hideInactiveStaffRests: true });
  assert.match(normal, /<note><rest\/><duration>16<\/duration><voice>2<\/voice>/);
  assert.match(display, /<note print-object="no"><rest\/><duration>16<\/duration><voice>2<\/voice>/);
  assert.deepEqual(measureVoices(normal), [[16, 16]]);
  // The display-only attribute is not an instruction to omit rhythmic rests.
  assert.ok(display.includes('<backup><duration>16</duration></backup>'));
  const bothHands = toMusicXml(createScoreFromExercise([
    note(48, 'bass'), note(60), note(62), note(64)
  ], 'C'), { hideInactiveStaffRests: true });
  assert.ok(!bothHands.includes('print-object="no"'),
    'staffs containing notes must retain real rhythmic rests');
});

test('G-pattern uses hidden timing rests and upward bass stems without touching default MusicXML', () => {
  const score = createScoreFromExercise([
    note(48, 'bass'), note(60), note(62), note(64),
    note(50, 'bass'), note(62), note(64), note(65)
  ], 'C');
  const standard = toMusicXml(score);
  const teaching = toMusicXml(score, {
    hideInactiveStaffRests: true, hideGeneratedRests: true, bassStemsUp: true
  });
  const restCount = (standard.match(/<rest\/>/g) || []).length;
  assert.ok(restCount > 0, 'each hand has silent beats requiring timing rests');
  assert.equal((teaching.match(/<note print-object="no"><rest\/>/g) || []).length, restCount);
  assert.ok(!standard.includes('print-object="no"'),
    'standard and exported MusicXML retain notated rests');
  assert.ok(!standard.includes('<stem>up</stem>'),
    'other modes keep the score engraver stem rules');
  assert.equal((teaching.match(/<stem>up<\/stem>/g) || []).length, 2,
    'only the two bass downbeats explicitly face up');
  assert.ok(/<type>quarter<\/type><stem>up<\/stem><staff>2<\/staff>/.test(teaching),
    'MusicXML stem must precede staff per the note element order');
  assert.deepEqual(
    Array.from(teaching.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g),
      match => match[1].includes('<backup><duration>16</duration></backup>')),
    [true, true]
  );
  // Hidden printed objects are still proper timed MusicXML notes (not removed).
  for (const match of teaching.matchAll(/<note print-object="no">([\s\S]*?)<\/note>/g)) {
    assert.match(match[1], /<duration>\d+<\/duration>/);
    assert.match(match[1], /<voice>[12]<\/voice>/);
  }
});

test('G-pattern flags do not affect independent simultaneous two-hand scores unless explicitly requested', () => {
  const score = createScoreFromHands([note(60), note(62)], [note(48), note(50)], 'C');
  const xml = toMusicXml(score, { hideInactiveStaffRests: true });
  assert.equal((xml.match(/print-object="no"/g) || []).length, 0);
  assert.equal((xml.match(/<stem>up<\/stem>/g) || []).length, 0);
});
