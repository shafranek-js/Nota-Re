import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLessonTwoHandScore } from '../src/core/training/lessonTwoHandScore.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import {
  initialTimedPractice, reduceTimedPractice, ticksToMs
} from '../src/core/training/tempoTwoHand.ts';
import { assessLessonReleases } from '../src/core/training/lessonReleaseEvidence.ts';
import { assessPolyphonicPractice } from '../src/core/training/polyphonicAssessment.ts';

const PLAN = { startMs: 10000, bpm: 68, windowMs: 160, overlapMs: 140, holdGraceMs: 120 };

function play(score, steps, durationScale = n => n.articulation === 'staccato' ? 0.45 : 1) {
  const events = score.notes.flatMap(note => {
    const start = PLAN.startMs + ticksToMs(note.onsetTicks, PLAN.bpm);
    const duration = ticksToMs(note.durationTicks, PLAN.bpm);
    return [
      { type: 'note-on', note: note.midi, channel: note.staff - 1,
        receivedAtMs: start, order: 1 },
      { type: 'note-off', note: note.midi, channel: note.staff - 1,
        receivedAtMs: start + duration * durationScale(note), order: 0 }
    ];
  }).sort((a, b) => a.receivedAtMs - b.receivedAtMs || a.order - b.order);
  let state = initialTimedPractice();
  for (const event of events) state = reduceTimedPractice(state, score, steps, PLAN, event);
  const end = Math.max(...score.notes.map(n => n.onsetTicks + n.durationTicks));
  return reduceTimedPractice(state, score, steps, PLAN, {
    type: 'tick', receivedAtMs: PLAN.startMs + ticksToMs(end, PLAN.bpm) + PLAN.windowMs + 1
  });
}

test('lesson 11 engraves LH beat one and RH beats 2–4 in both measures', () => {
  const { score, steps } = createLessonTwoHandScore(11, 'C');
  assert.deepEqual(score.notes.filter(n => n.staff === 2).map(n => n.onsetTicks), [0, 16]);
  assert.deepEqual(score.notes.filter(n => n.staff === 1).map(n => n.onsetTicks),
    [4, 8, 12, 20, 24, 28]);
  assert.equal(steps[0].onsetTicks, 0);
  assert.deepEqual(steps[0].expectedMidi, [48]);
  assert.deepEqual(steps[1].expectedMidi, [60]);
  const xml = toMusicXml(score);
  assert.match(xml, /<staves>2<\/staves>/);
  assert.equal((xml.match(/<measure number=/g) ?? []).length, 2);
  assert.match(xml, /<rest\/>/);
});

test('lesson 12 has explicit legato RH eighths and staccato LH quarters', () => {
  const { score, steps } = createLessonTwoHandScore(12, 'C');
  const rh = score.notes.filter(n => n.staff === 1);
  const lh = score.notes.filter(n => n.staff === 2);
  assert.equal(rh.length, 16);
  assert.equal(lh.length, 8);
  assert.ok(rh.every(n => n.durationTicks === 2 && n.articulation === 'legato'));
  assert.ok(lh.every(n => n.durationTicks === 4 && n.articulation === 'staccato'));
  assert.deepEqual(steps[0].expectedMidi, [48, 60]);
  assert.equal(steps.length, 16);
  assert.equal((toMusicXml(score).match(/<staccato\/>/g) ?? []).length, 8);
  assert.ok(toMusicXml(score, { includeFingering: true }).includes('<fingering>'));
  assert.equal(createLessonTwoHandScore(12, 'F').score.fifths, -1);
  assert.throws(() => createLessonTwoHandScore(9, 'C'), /Unsupported/);
});

test('clean scored physical NoteOff evidence verifies durations but not fingering', () => {
  const { score, steps } = createLessonTwoHandScore(12, 'C');
  const state = play(score, steps);
  assert.equal(state.hits, steps.length);
  assert.equal(state.misses, 0);
  assert.equal(state.earlyReleases, 0);
  assert.equal(state.overheldNotes, 0);
  assert.equal(state.releasedNotes.length, score.notes.length);
  const evidence = assessLessonReleases(score, state);
  assert.deepEqual(evidence.staccato, { expected: 8, observed: 8 });
  assert.deepEqual(evidence.legato, { expected: 16, observed: 16 });
  assert.equal(evidence.complete, true);
  assert.equal(evidence.validated, true);
  assert.equal(evidence.fingeringVerified, false);
  assert.equal(assessPolyphonicPractice(score, steps, state).clean, true);
});

test('held staccato through the whole quarter is overheld, not valid legato', () => {
  const { score, steps } = createLessonTwoHandScore(12, 'C');
  const state = play(score, steps, () => 1);
  assert.ok(state.overheldNotes > 0);
  assert.equal(assessLessonReleases(score, state).validated, false);
  assert.equal(assessPolyphonicPractice(score, steps, state).clean, false);
});

test('shortened legato eighths and excessively short staccato are errors', () => {
  const { score, steps } = createLessonTwoHandScore(12, 'C');
  for (const factor of [
    n => n.articulation === 'legato' ? 0.25 : 0.45,
    n => n.articulation === 'staccato' ? 0.01 : 1
  ]) {
    const state = play(score, steps, factor);
    assert.ok(state.earlyReleases > 0);
    assert.equal(assessLessonReleases(score, state).validated, false);
  }
});

test('missing and inconsistent NoteOff evidence cannot validate a study', () => {
  const { score, steps } = createLessonTwoHandScore(12, 'C');
  const state = play(score, steps);
  for (const changes of [
    { releasedNotes: state.releasedNotes.slice(0, -1) },
    { releasedNotes: [...state.releasedNotes, state.releasedNotes[0]] },
    { releasedNotes: [...state.releasedNotes.slice(1), { onsetTicks: 999, midi: 60, atMs: 10000 }] },
    { releasedNotes: [...state.releasedNotes.slice(1), { ...state.releasedNotes[0], atMs: NaN }] },
    { interruptions: 1 },
    { finished: false }
  ]) assert.equal(assessLessonReleases(score, { ...state, ...changes }).validated, false);
});
