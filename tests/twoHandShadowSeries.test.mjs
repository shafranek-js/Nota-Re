import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonTwoHandScore } from '../src/core/training/lessonTwoHandScore.ts';
import { initialTimedPractice, reduceTimedPractice, ticksToMs } from '../src/core/training/tempoTwoHand.ts';
import { getTwoHandShadowPolicy, evaluateTwoHandShadowAttempt,
  appendShadowAttempt, initialShadowSeries, nextTwoHandShadowStudy } from '../src/core/training/twoHandShadowSeries.ts';

function performance(lessonId, studyIndex = 0) {
  const { score, steps } = createLessonTwoHandScore(lessonId, 'C', studyIndex);
  const plan = { startMs: 10000, bpm: lessonId === 11 ? 58 : 68,
    windowMs: 160, overlapMs: 140, holdGraceMs: 120 };
  const events = score.notes.flatMap(n => {
    const start = plan.startMs + ticksToMs(n.onsetTicks, plan.bpm);
    const duration = ticksToMs(n.durationTicks, plan.bpm);
    return [
      { type: 'note-on', note: n.midi, channel: n.staff - 1,
        receivedAtMs: start, order: 1 },
      { type: 'note-off', note: n.midi, channel: n.staff - 1,
        receivedAtMs: start + duration * (n.articulation === 'staccato' ? 0.45 : 1),
        order: 0 }
    ];
  }).sort((a, b) => a.receivedAtMs - b.receivedAtMs || a.order - b.order);
  let timed = initialTimedPractice();
  for (const e of events) timed = reduceTimedPractice(timed, score, steps, plan, e);
  const end = Math.max(...score.notes.map(n => n.onsetTicks + n.durationTicks));
  timed = reduceTimedPractice(timed, score, steps, plan,
    { type: 'tick', receivedAtMs: plan.startMs + ticksToMs(end, plan.bpm) + 161 });
  return { score, steps, plan, timed };
}
const evaluate = (id, studyIndex = 0) => {
  const { score, steps, plan, timed } = performance(id, studyIndex);
  return evaluateTwoHandShadowAttempt(id, score, steps, timed, plan, studyIndex);
};

test('rubric inherits lesson repeats and publishes reaction targets WITHOUT conflating BPM', () => {
  const a = getTwoHandShadowPolicy(11);
  const b = getTwoHandShadowPolicy(12);
  assert.deepEqual(
    [a.requiredCleanStudies, a.consecutive, a.curriculumAccuracyPercent, a.curriculumReactionMs],
    [15, true, 92, 580]);
  assert.deepEqual(
    [b.requiredCleanStudies, b.consecutive, b.curriculumAccuracyPercent, b.curriculumReactionMs],
    [20, false, 94, 500]);
  assert.equal(a.allowedMeanOnsetDeviationMs, 110);
  assert.equal(b.provisional, true);
  assert.equal(getTwoHandShadowPolicy(10), null);
  assert.equal(getTwoHandShadowPolicy(null), null);
});

test('complete physical NoteOn and NoteOff trace qualifies as a training study, never formal credit', () => {
  for (const id of [11, 12]) {
    const v = evaluate(id);
    assert.equal(v.accepted, true);
    assert.deepEqual(v.reasons, []);
    assert.equal(v.noteAccuracyPercent, 100);
    assert.equal(v.meanOnsetDeviationMs, 0);
    assert.equal(v.acceptedNoteReleases, v.expectedNoteReleases);
    assert.equal(v.officialCourseCredit, false);
  }
});

test('errors, missing NoteOff, late attacks and MIDI interruption disqualify a study', () => {
  for (const id of [11, 12]) {
    const { score, steps, timed, plan } = performance(id);
    const variants = [
      { data: { ...timed, releasedNotes: timed.releasedNotes.slice(1) },
        reason: 'release-or-articulation' },
      { data: { ...timed, wrongPitches: 1 }, reason: 'onset-or-pitch' },
      { data: { ...timed, interruptions: 1 }, reason: 'hardware-interruption' },
      { data: { ...timed, finished: false }, reason: 'not-finished' },
      { data: { ...timed, onsetDeviationsMs: timed.onsetDeviationsMs.map(() => 150) },
        reason: 'onset-or-pitch' }
    ];
    for (const { data, reason } of variants) {
      const verdict = evaluateTwoHandShadowAttempt(id, score, steps, data, plan);
      assert.equal(verdict.accepted, false, String(id) + ': ' + reason);
      assert.ok(verdict.reasons.includes(reason), String(id) + ': ' + reason);
      assert.equal(verdict.officialCourseCredit, false);
    }
  }
});

test('wrong score, onset map, key or generous timing cannot masquerade as course study', () => {
  const { score, steps, timed, plan } = performance(12);
  const changed = { ...score, notes: [{ ...score.notes[0], midi: 61 }, ...score.notes.slice(1)] };
  assert.ok(evaluateTwoHandShadowAttempt(12, changed, steps, timed, plan).reasons.includes('invalid-score'));
  assert.ok(evaluateTwoHandShadowAttempt(12, score, steps.slice(1), timed, plan).reasons.includes('invalid-score'));
  assert.ok(evaluateTwoHandShadowAttempt(12, { ...score, fifths: 1 }, steps, timed, plan).reasons.includes('invalid-score'));
  assert.ok(evaluateTwoHandShadowAttempt(12, score, steps, timed,
    { ...plan, bpm: 80 }).reasons.includes('invalid-tempo'));
  assert.ok(evaluateTwoHandShadowAttempt(12, score, steps, timed,
    { ...plan, windowMs: 1000 }).reasons.includes('invalid-tempo'));
});

test('lesson 11 requires 15 DISTINCT clean studies in a row; errors reset the current sequence', () => {
  let state = initialShadowSeries(11);
  for (let index = 0; index < 14; index++) {
    assert.equal(nextTwoHandShadowStudy(state), index);
    state = appendShadowAttempt(state, 11, index + 1, evaluate(11, index));
  }
  assert.equal(state.cleanStreak, 14);
  assert.equal(state.successfulStudies.length, 14);
  assert.equal(state.practiceTargetReached, false);
  const before = state;
  assert.equal(appendShadowAttempt(state, 11, 14, evaluate(11, 13)), before,
    'duplicate timer callback cannot record another attempt');
  const failed = { ...evaluate(11, 14), accepted: false, reasons: ['onset-or-pitch'] };
  state = appendShadowAttempt(state, 11, 15, failed);
  assert.equal(state.cleanStreak, 0);
  assert.deepEqual(state.successfulStudies, [], 'failure invalidates consecutive course practice');
  assert.equal(nextTwoHandShadowStudy(state), 0);
  state = appendShadowAttempt(state, 11, 16, null);
  assert.equal(state.aborted, 1);
  for (let index = 0; index < 15; index++) {
    state = appendShadowAttempt(state, 11, 17 + index, evaluate(11, index));
  }
  assert.equal(state.cleanStreak, 15);
  assert.equal(state.successfulStudies.length, 15);
  assert.equal(state.accepted, 29);
  assert.equal(state.attempts, 31);
  assert.equal(state.practiceTargetReached, true);
  assert.equal(nextTwoHandShadowStudy(state), null);
  assert.equal(state.lastVerdict.officialCourseCredit, false);
});

test('replaying same study cannot inflate either distinct-study counter', () => {
  for (const id of [11, 12]) {
    let state = appendShadowAttempt(initialShadowSeries(id), id, 1, evaluate(id, 0));
    state = appendShadowAttempt(state, id, 2, evaluate(id, 0));
    assert.equal(state.accepted, 1);
    assert.equal(state.rejected, 1);
    assert.equal(state.lastVerdict.accepted, false);
    assert.deepEqual(state.lastVerdict.reasons, ['duplicate-study']);
    assert.equal(state.practiceTargetReached, false);
    if (id === 11) {
      assert.deepEqual(state.successfulStudies, []);
      assert.equal(state.cleanStreak, 0);
      assert.equal(nextTwoHandShadowStudy(state), 0);
    } else {
      assert.deepEqual(state.successfulStudies, [0]);
      assert.equal(nextTwoHandShadowStudy(state), 1);
    }
  }
});

test('lesson 12 requires 20 distinct studies cumulatively; failed run cannot inflate count', () => {
  let state = initialShadowSeries(12);
  for (let index = 0; index < 19; index++) {
    assert.equal(nextTwoHandShadowStudy(state), index);
    state = appendShadowAttempt(state, 12, index + 1, evaluate(12, index));
  }
  const bad = { ...evaluate(12, 19), accepted: false, reasons: ['release-or-articulation'] };
  state = appendShadowAttempt(state, 12, 20, bad);
  assert.equal(state.practiceTargetReached, false);
  assert.equal(state.cleanStreak, 0);
  assert.equal(nextTwoHandShadowStudy(state), 19);
  state = appendShadowAttempt(state, 12, 21, evaluate(12, 19));
  assert.equal(state.successfulStudies.length, 20);
  assert.equal(state.accepted, 20);
  assert.equal(state.practiceTargetReached, true);
  assert.equal(nextTwoHandShadowStudy(state), null);
  assert.equal(appendShadowAttempt(state, 11, 22, evaluate(11, 0)), state);
  assert.equal(appendShadowAttempt(state, 12, -1, evaluate(12, 0)), state);
  assert.equal(appendShadowAttempt(state, 12, 21, evaluate(12, 0)), state);
  assert.equal(initialShadowSeries(12).attempts, 0);
  assert.equal('completedLessons' in state, false);
});

test('score from one mini-study never validates as another mini-study', () => {
  for (const id of [11, 12]) {
    const { score, steps, plan, timed } = performance(id, 1);
    assert.equal(evaluateTwoHandShadowAttempt(id, score, steps, timed, plan, 1).accepted, true);
    for (const other of [0, 2, -1, 999, NaN]) {
      const result = evaluateTwoHandShadowAttempt(id, score, steps, timed, plan, other);
      assert.equal(result.accepted, false);
      assert.ok(result.reasons.includes('invalid-score'));
    }
  }
});
