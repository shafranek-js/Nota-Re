import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTwoHandPractice } from '../src/core/training/twoHandPractice.ts';
import { initialTimedPractice } from '../src/core/training/tempoTwoHand.ts';
import { assessPolyphonicPractice } from '../src/core/training/polyphonicAssessment.ts';

const exercise = createTwoHandPractice('C', 8, 'staggered');
const { score, steps } = exercise;

const completed = (overrides = {}) => ({
  ...initialTimedPractice(),
  stepIndex: steps.length,
  finished: true,
  hits: steps.length,
  hitOnsets: steps.map(step => step.onsetTicks),
  acceptedAttacks: score.notes.map(n => ({
    onsetTicks: n.onsetTicks, midi: n.midi, atMs: 10000 + n.onsetTicks * 250
  })),
  releasedNotes: score.notes.map(n => ({
    onsetTicks: n.onsetTicks, midi: n.midi,
    atMs: 10000 + (n.onsetTicks + n.durationTicks) * 250
  })),
  onsetDeviationsMs: steps.map(() => 45),
  ...overrides
});

test('clean two-hand performance reports separate hands and trial readiness, never course credit', () => {
  const result = assessPolyphonicPractice(score, steps, completed());
  assert.deepEqual([result.right.expected, result.right.matched],
    [score.notes.filter(n => n.staff === 1).length, score.notes.filter(n => n.staff === 1).length]);
  assert.deepEqual([result.left.expected, result.left.matched],
    [score.notes.filter(n => n.staff === 2).length, score.notes.filter(n => n.staff === 2).length]);
  assert.equal(result.meanAbsoluteDeviationMs, 45);
  assert.equal(result.complete, true);
  assert.deepEqual(result.releaseEvidence, {
    expected: score.notes.length, matched: score.notes.length, missing: 0
  });
  assert.equal(result.clean, true);
  assert.equal(result.readyForCourseTrial, true);
  assert.ok(!('completedLessons' in result));
});

test('a missed concurrent attack loses credit separately in both affected staves', () => {
  const missing = steps.find(step => step.expectedMidi.length === 2);
  assert.ok(missing, 'test rhythm needs at least one simultaneous attack');
  const hitOnsets = steps.map(x => x.onsetTicks).filter(tick => tick !== missing.onsetTicks);
  // Bass entered correctly at the shared onset; treble did not.
  const acceptedAttacks = score.notes
    .filter(n => n.onsetTicks !== missing.onsetTicks || n.staff === 2)
    .map(n => ({ onsetTicks: n.onsetTicks, midi: n.midi,
      atMs: 10000 + n.onsetTicks * 250 }));
  const result = assessPolyphonicPractice(score, steps, completed({
    hits: hitOnsets.length, misses: 1,
    hitOnsets, acceptedAttacks, onsetDeviationsMs: hitOnsets.map(() => 20)
  }));
  assert.equal(result.complete, true);
  assert.equal(result.clean, false);
  assert.equal(result.readyForCourseTrial, false);
  assert.ok(result.right.matched < result.right.expected);
  assert.equal(result.left.matched, result.left.expected,
    'a correct bass note must not be blamed for a missing treble note');
  assert.ok(result.recommendations.some(s => s.includes('правой')));
  assert.ok(!result.recommendations.some(s => s.includes('левой')));
});

test('one-hand-only hit cannot earn the other hand credit by silence or held notes', () => {
  const onlyLeft = steps.filter(step =>
    score.notes.some(n => n.staff === 2 && n.onsetTicks === step.onsetTicks) &&
    !score.notes.some(n => n.staff === 1 && n.onsetTicks === step.onsetTicks));
  const onsets = onlyLeft.map(step => step.onsetTicks);
  const result = assessPolyphonicPractice(score, steps, completed({
    hits: onsets.length, misses: steps.length - onsets.length,
    hitOnsets: onsets,
    acceptedAttacks: score.notes.filter(n => n.staff === 2 && onsets.includes(n.onsetTicks))
      .map(n => ({ onsetTicks: n.onsetTicks, midi: n.midi, atMs: 10000 + n.onsetTicks * 250 })),
    onsetDeviationsMs: onsets.map(() => 10)
  }));
  assert.equal(result.right.matched, 0);
  assert.ok(result.left.matched > 0);
  assert.equal(result.readyForCourseTrial, false);
});

test('timing, release faults, extraneous pitches and disconnect individually prevent readiness', () => {
  for (const field of ['earlyReleases', 'overheldNotes', 'wrongPitches', 'offBeatNotes', 'interruptions']) {
    const result = assessPolyphonicPractice(score, steps, completed({ [field]: 1 }));
    assert.equal(result.clean, false, field);
    assert.equal(result.readyForCourseTrial, false, field);
  }
  const offTempo = assessPolyphonicPractice(score, steps, completed({
    onsetDeviationsMs: steps.map(() => 151)
  }));
  assert.equal(offTempo.clean, true, 'notation accuracy is a separate criterion');
  assert.equal(offTempo.readyForCourseTrial, false);
  assert.ok(offTempo.recommendations.some(s => s.includes('ритм')));
});

test('incomplete, inconsistent, duplicated or tampered evidence is never accepted', () => {
  const variants = [
    { finished: false },
    { stepIndex: steps.length - 1 },
    { hits: steps.length + 1 },
    { hitOnsets: steps.map(() => 0) },
    { onsetDeviationsMs: [10] },
    { hitOnsets: [...steps.map(x => x.onsetTicks), 999] },
    { onsetDeviationsMs: steps.map(() => NaN) },
    { acceptedAttacks: [] },
    { acceptedAttacks: [...completed().acceptedAttacks, completed().acceptedAttacks[0]] },
    { releasedNotes: [] },
    { releasedNotes: [...completed().releasedNotes, completed().releasedNotes[0]] },
    { releasedNotes: [{ onsetTicks: -4, midi: 99, atMs: 12000 }] },
    { releasedNotes: [{ ...completed().releasedNotes[0], atMs: Number.NaN }] }
  ];
  for (const changes of variants) {
    const result = assessPolyphonicPractice(score, steps, completed(changes));
    assert.equal(result.readyForCourseTrial, false);
  }
  assert.throws(() => assessPolyphonicPractice(score, steps, completed(), NaN));
  assert.throws(() => assessPolyphonicPractice(score, [], completed()), /Invalid/);
});

test('a lone correct bass NoteOn is reported independently when right-hand chord fails', async () => {
  const { createTwoHandPractice } = await import('../src/core/training/twoHandPractice.ts');
  const { reduceTimedPractice } = await import('../src/core/training/tempoTwoHand.ts');
  const sample = createTwoHandPractice('C', 8, 'steady');
  const plan = { startMs: 10000, bpm: 60, windowMs: 160, overlapMs: 140, holdGraceMs: 120 };
  let trial = reduceTimedPractice(initialTimedPractice(), sample.score, sample.steps, plan,
    { type: 'note-on', note: 48, channel: 2, receivedAtMs: 10005 });
  assert.equal(trial.hits, 0, 'the simultaneous chord did not complete');
  assert.deepEqual(trial.acceptedAttacks.map(x => x.midi), [48]);
  trial = reduceTimedPractice(trial, sample.score, sample.steps, plan,
    { type: 'tick', receivedAtMs: 10161 });
  trial = reduceTimedPractice(trial, sample.score, sample.steps, plan,
    { type: 'tick', receivedAtMs: 10000 + 8000 + 200 });
  const result = assessPolyphonicPractice(sample.score, sample.steps, trial);
  assert.equal(result.left.matched, 1);
  assert.equal(result.right.matched, 0);
  assert.equal(result.readyForCourseTrial, false);
});


test('missing physical NoteOff cannot be counted as a clean performance even when all attacks match', () => {
  const sample = completed({ releasedNotes: completed().releasedNotes.slice(0, -1) });
  const result = assessPolyphonicPractice(score, steps, sample);
  assert.equal(result.complete, true, 'musical onset timeline can still be complete');
  assert.equal(result.clean, false, 'physical release evidence is mandatory');
  assert.equal(result.readyForCourseTrial, false);
  assert.deepEqual(result.releaseEvidence, {
    expected: score.notes.length, matched: score.notes.length - 1, missing: 1
  });
  assert.ok(result.recommendations.some(line => line.includes('NoteOff')));
  const pending = assessPolyphonicPractice(score, steps, completed({
    sustained: [{ note: 55, channel: 0, onsetTicks: 0,
      minReleaseMs: 10000, untilMs: 20000 }]
  }));
  assert.equal(pending.clean, false, 'unreleased physical holds cannot be cleared by the timeline ending');
});
