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
  assert.equal(result.clean, true);
  assert.equal(result.readyForCourseTrial, true);
  assert.ok(!('completedLessons' in result));
});

test('a missed concurrent attack loses credit separately in both affected staves', () => {
  const missing = steps.find(step => step.expectedMidi.length === 2);
  assert.ok(missing, 'test rhythm needs at least one simultaneous attack');
  const hitOnsets = steps.map(x => x.onsetTicks).filter(tick => tick !== missing.onsetTicks);
  const result = assessPolyphonicPractice(score, steps, completed({
    hits: hitOnsets.length, misses: 1,
    hitOnsets, onsetDeviationsMs: hitOnsets.map(() => 20)
  }));
  assert.equal(result.complete, true);
  assert.equal(result.clean, false);
  assert.equal(result.readyForCourseTrial, false);
  assert.ok(result.right.matched < result.right.expected);
  assert.ok(result.left.matched < result.left.expected);
  assert.ok(result.recommendations.some(s => s.includes('правой')));
  assert.ok(result.recommendations.some(s => s.includes('левой')));
});

test('one-hand-only hit cannot earn the other hand credit by silence or held notes', () => {
  const onlyLeft = steps.filter(step =>
    score.notes.some(n => n.staff === 2 && n.onsetTicks === step.onsetTicks) &&
    !score.notes.some(n => n.staff === 1 && n.onsetTicks === step.onsetTicks));
  const onsets = onlyLeft.map(step => step.onsetTicks);
  const result = assessPolyphonicPractice(score, steps, completed({
    hits: onsets.length, misses: steps.length - onsets.length,
    hitOnsets: onsets, onsetDeviationsMs: onsets.map(() => 10)
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
    { onsetDeviationsMs: steps.map(() => NaN) }
  ];
  for (const changes of variants) {
    const result = assessPolyphonicPractice(score, steps, completed(changes));
    assert.equal(result.readyForCourseTrial, false);
  }
  assert.throws(() => assessPolyphonicPractice(score, steps, completed(), NaN));
  assert.throws(() => assessPolyphonicPractice(score, [], completed()), /Invalid/);
});
