import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTwoHandPractice, initialChordPractice, reduceChordPractice
} from '../src/core/training/twoHandPractice.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';

const noteOn = (note, t, channel = 0) =>
  ({ type: 'note-on', note, channel, receivedAtMs: t });
const noteOff = (note, channel = 0) =>
  ({ type: 'note-off', note, channel });

test('independent hands start together, then left sustains under right-hand attacks', () => {
  const { score, steps } = createTwoHandPractice('C', 8);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map(x => x.onsetTicks), [0, 4, 8, 12, 16, 20, 24, 28]);
  assert.deepEqual(steps[0].expectedMidi, [48, 60]);
  assert.deepEqual(steps[1].expectedMidi, [62]);
  assert.deepEqual(steps[2].expectedMidi, [55, 64]);
  assert.equal(score.notes.filter(n => n.staff === 1).length, 8);
  assert.equal(score.notes.filter(n => n.staff === 2).length, 4);
  assert.deepEqual(score.notes.filter(n => n.staff === 2).map(n => [n.onsetTicks, n.durationTicks]), [
    [0, 8], [8, 8], [16, 8], [24, 8]
  ]);
  const xml = toMusicXml(score);
  assert.equal((xml.match(/<backup><duration>16<\/duration><\/backup>/g) ?? []).length, 2);
});

test('tonality adjusts both notation and expected MIDI notes', () => {
  const { score, steps } = createTwoHandPractice('G', 8);
  assert.ok(score.notes.some(note => note.midi === 66), 'F# in G major');
  assert.ok(steps.some(step => step.expectedMidi.includes(66)));
  assert.match(toMusicXml(score), /<fifths>1<\/fifths>/);
});

test('chord succeeds only with overlapping real note-ons, even across channels', () => {
  const steps = createTwoHandPractice('C', 8).steps;
  let state = initialChordPractice();
  state = reduceChordPractice(state, steps, noteOn(48, 10, 2));
  assert.equal(state.stepIndex, 0);
  assert.equal(state.feedback, 'partial');
  state = reduceChordPractice(state, steps, noteOn(60, 100, 0));
  assert.equal(state.stepIndex, 1);
  assert.equal(state.feedback, 'correct');
  state = reduceChordPractice(state, steps, noteOn(60, 105, 0));
  assert.equal(state.stepIndex, 1, 'duplicate note-on does not add a success');
  state = reduceChordPractice(state, steps, noteOn(62, 140, 0));
  assert.equal(state.stepIndex, 2);
});

test('releasing the first note before the second does not count as a chord', () => {
  const steps = createTwoHandPractice('C', 8).steps;
  let state = reduceChordPractice(initialChordPractice(), steps, noteOn(48, 10));
  state = reduceChordPractice(state, steps, noteOff(48));
  state = reduceChordPractice(state, steps, noteOn(60, 50));
  assert.equal(state.stepIndex, 0);
  assert.equal(state.feedback, 'partial');
  state = reduceChordPractice(state, steps, noteOn(48, 70));
  assert.equal(state.stepIndex, 1);
});

test('strikes outside simultaneity window must be repeated', () => {
  const steps = createTwoHandPractice('C', 8).steps;
  let state = reduceChordPractice(initialChordPractice(), steps, noteOn(48, 10));
  state = reduceChordPractice(state, steps, noteOn(60, 500));
  assert.equal(state.stepIndex, 0);
  assert.equal(state.feedback, 'slow');
  state = reduceChordPractice(state, steps, noteOff(48));
  state = reduceChordPractice(state, steps, noteOn(48, 530));
  assert.equal(state.stepIndex, 1);
});

test('wrong pitches and panic never advance an event or grade a lesson', () => {
  const steps = createTwoHandPractice('C', 8).steps;
  let state = reduceChordPractice(initialChordPractice(), steps, noteOn(48, 10));
  state = reduceChordPractice(state, steps, noteOn(65, 20));
  assert.equal(state.stepIndex, 0);
  assert.equal(state.feedback, 'wrong');
  state = reduceChordPractice(state, steps, { type: 'panic' });
  assert.deepEqual(state, initialChordPractice());
  state = reduceChordPractice(state, steps, noteOn(48, 100));
  state = reduceChordPractice(state, steps, noteOn(60, 120));
  assert.equal(state.stepIndex, 1);
});
