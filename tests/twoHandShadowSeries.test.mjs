import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonTwoHandScore } from '../src/core/training/lessonTwoHandScore.ts';
import { initialTimedPractice, reduceTimedPractice, ticksToMs } from '../src/core/training/tempoTwoHand.ts';
import { getTwoHandShadowPolicy, evaluateTwoHandShadowAttempt,
  appendShadowAttempt, initialShadowSeries } from '../src/core/training/twoHandShadowSeries.ts';

function performance(lessonId) {
  const { score, steps } = createLessonTwoHandScore(lessonId, 'C');
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
const evaluate = id => {
  const { score, steps, plan, timed } = performance(id);
  return evaluateTwoHandShadowAttempt(id, score, steps, timed, plan);
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

test('lesson 11 requires 15 clean studies IN A ROW, aborted/failed attempts reset streak', () => {
  let s = initialShadowSeries(11);
  const good = evaluate(11);
  const bad = { ...good, accepted: false, reasons: ['onset-or-pitch'] };
  for (let id = 1; id <= 14; id++) s = appendShadowAttempt(s, 11, id, good);
  assert.equal(s.cleanStreak, 14);
  assert.equal(s.practiceTargetReached, false);
  const before = s;
  assert.equal(appendShadowAttempt(s, 11, 14, good), before, 'duplicate callback');
  s = appendShadowAttempt(s, 11, 15, bad);
  assert.equal(s.cleanStreak, 0);
  assert.equal(s.accepted, 14);
  s = appendShadowAttempt(s, 11, 16, null);
  assert.equal(s.aborted, 1);
  for (let id = 17; id <= 31; id++) s = appendShadowAttempt(s, 11, id, good);
  assert.equal(s.cleanStreak, 15);
  assert.equal(s.accepted, 29);
  assert.equal(s.attempts, 31);
  assert.equal(s.practiceTargetReached, true);
  assert.equal(s.lastVerdict.officialCourseCredit, false);
});

test('lesson 12 needs 20 clean repeats total; failures do not erase cumulative practice', () => {
  let s = initialShadowSeries(12);
  const good = evaluate(12);
  const bad = { ...good, accepted: false, reasons: ['release-or-articulation'] };
  for (let id = 1; id <= 19; id++) s = appendShadowAttempt(s, 12, id, good);
  s = appendShadowAttempt(s, 12, 20, bad);
  assert.equal(s.practiceTargetReached, false);
  assert.equal(s.cleanStreak, 0);
  s = appendShadowAttempt(s, 12, 21, good);
  assert.equal(s.accepted, 20);
  assert.equal(s.practiceTargetReached, true);
  assert.equal(appendShadowAttempt(s, 11, 22, good), s);
  assert.equal(appendShadowAttempt(s, 12, -1, good), s);
  assert.equal(appendShadowAttempt(s, 12, 21, good), s);
  assert.equal(initialShadowSeries(12).attempts, 0);
  assert.equal('completedLessons' in s, false);
});
