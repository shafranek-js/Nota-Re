import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_CURRICULUM } from '../src/data/curriculum.ts';
import { allowsAutomaticLessonCredit, requiresSpeedForLessonCredit } from '../src/core/training/courseAssessmentPolicy.ts';
import { appendCourseWindow, evaluateCourseWindow, gradedScoreFromEvents, lessonTenLookaheadCount,
  qualifiesLegacyLessonOne } from '../src/core/training/recentCourseWindow.ts';
import { validateRecentCourseStorage } from '../src/core/storage/recentCourseStorage.ts';

const score = (mode = 'reflex', correct = 16, judged = 16, reaction = 1400) =>
  ({ mode, judgedNotes: judged, correctNotes: correct, reactionSamples: correct,
     reactionTotalMs: correct * reaction });
const event = (i, outcome, reactionMs = 1400) =>
  ({ noteIndex: i, outcome, reactionMs, expectedNote: 'C4', playedNote: outcome === 'missed' ? null : 'C4' });

test('full curriculum audit: pitch-accuracy window for 1–10, manual grading 11–12, no raw-delay gate', () => {
  assert.equal(COURSE_CURRICULUM.length, 12);
  for (const lesson of COURSE_CURRICULUM) {
    assert.equal(requiresSpeedForLessonCredit(lesson.id), false, `lesson ${lesson.id}`);
    assert.equal(allowsAutomaticLessonCredit(lesson.id), lesson.id <= 10);
    if (lesson.id >= 11) continue;
    const mode = lesson.id === 10 ? 'lookahead' : lesson.preset.mode;
    let history = [];
    for (let i = 0; i < lesson.normReps; i++) {
      const nextMode = lesson.id === 10 && i >= 7 ? 'photo' : mode;
      history = appendCourseWindow(history, score(nextMode), lesson.id, lesson.normReps);
    }
    const evaluation = evaluateCourseWindow(history, lesson.id, lesson.normReps, lesson.normAcc);
    assert.equal(evaluation.passed, true, `lesson ${lesson.id}: all-correct slow evidence must pass`);
    assert.ok(evaluation.averageReactionMs > lesson.normSpeed);
    assert.equal(evaluateCourseWindow(history.slice(1), lesson.id, lesson.normReps, lesson.normAcc).passed,
      false, 'incomplete window must never certify');
  }
});

test('lesson 2: earlier bad lifetime history cannot contaminate 15 recent scores', () => {
  const lesson = COURSE_CURRICULUM[1];
  let history = [];
  for (let i = 0; i < 15; i++) history = appendCourseWindow(history, score(), 2, 15);
  const oldWrong = score('reflex', 0);
  history = appendCourseWindow(history, oldWrong, 2, 15);
  assert.ok(evaluateCourseWindow(history, 2, 15, lesson.normAcc).accuracy < 100);
  for (let i = 0; i < 15; i++) history = appendCourseWindow(history, score(), 2, 15);
  assert.equal(history.length, 15);
  assert.equal(evaluateCourseWindow(history, 2, 15, lesson.normAcc).passed, true);
});

test('lesson 10: exactly seven lookahead + eight photo, repeating photo never erases lookahead', () => {
  let window = [];
  for (let i = 0; i < 7; i++) window = appendCourseWindow(window, score('lookahead'), 10, 15);
  assert.equal(lessonTenLookaheadCount(window), 7);
  for (let i = 0; i < 8; i++) window = appendCourseWindow(window, score('photo'), 10, 15);
  assert.equal(evaluateCourseWindow(window, 10, 15, 90).passed, true);
  window = appendCourseWindow(window, score('photo'), 10, 15);
  assert.equal(window.length, 15);
  assert.equal(window.filter(e => e.mode === 'lookahead').length, 7);
  assert.equal(window.filter(e => e.mode === 'photo').length, 8);
  assert.equal(evaluateCourseWindow(window, 10, 15, 90).passed, true);
  const invalid = Array.from({ length: 15 }, () => score('photo'));
  assert.equal(evaluateCourseWindow(invalid, 10, 15, 90).passed, false);
});

test('record only actual graded errors; invalid attempts and legacy totals never generate fake records', () => {
  const entry = gradedScoreFromEvents('reflex', [
    event(0, 'wrong-pitch', null), event(0, 'correct'), event(1, 'missed', null)
  ]);
  assert.deepEqual(entry, { mode: 'reflex', judgedNotes: 3, correctNotes: 1,
    reactionSamples: 1, reactionTotalMs: 1400 });
  const lifetime = { completedExercises: 30, judgedNotes: 480, correctNotes: 433,
    reactionSamples: 433, reactionTotalMs: 433 * 1259 };
  assert.equal(qualifiesLegacyLessonOne([], lifetime, 10, 90, score()), true);
  assert.equal(qualifiesLegacyLessonOne([], lifetime, 10, 90, score('reflex', 0)), false);
  assert.equal(qualifiesLegacyLessonOne([score()], lifetime, 10, 90, score()), false);
  assert.deepEqual(validateRecentCourseStorage({ version: 1, lessons: { 2: [score()] } }), {});
  assert.deepEqual(validateRecentCourseStorage({ version: 2, lessons: { 2: [
    { ...score(), reactionTotalMs: NaN }
  ] } }), {});
  assert.equal(validateRecentCourseStorage({ version: 2, lessons: { 2: [score()] } })[2].length, 1);
});
