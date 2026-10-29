import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidateInterruptedTimedLesson } from '../src/core/training/flowInterruption.ts';

test('any interrupted timed lesson loses course eligibility and repetition credit', () => {
  const previous = Object.freeze({
    isContinuousFlow: true,
    activeLessonId: 12,
    completedExercisesCount: 2,
    isExerciseFlawless: true,
    totalAttempts: 3
  });
  const next = { ...previous, ...invalidateInterruptedTimedLesson() };
  assert.equal(next.isContinuousFlow, false);
  assert.equal(next.activeLessonId, null);
  assert.equal(next.completedExercisesCount, 0);
  assert.equal(next.isExerciseFlawless, false);
  assert.equal(next.totalAttempts, 3, 'existing real attempts remain truthful');
  assert.equal(previous.activeLessonId, 12, 'previous snapshot remains immutable');
});
