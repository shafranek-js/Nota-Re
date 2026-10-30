import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsAutomaticLessonCredit, isTwoHandCourseLesson, requiresSpeedForLessonCredit
} from '../src/core/training/courseAssessmentPolicy.ts';

test('automatic single-note certification excludes two-hand lessons', () => {
  for (let id = 1; id <= 10; id++) {
    assert.equal(allowsAutomaticLessonCredit(id), true);
    assert.equal(isTwoHandCourseLesson(id), false);
  }
  for (const id of [11, 12]) {
    assert.equal(allowsAutomaticLessonCredit(id), false);
    assert.equal(isTwoHandCourseLesson(id), true);
  }
  for (const id of [null, 0, 13, -1, 1.5, NaN]) {
    assert.equal(allowsAutomaticLessonCredit(id), false);
  }
});

test('none of the 12 lessons use raw reaction delay as an automatic credit gate', () => {
  for (let id = 1; id <= 12; id++) assert.equal(requiresSpeedForLessonCredit(id), false);
  assert.equal(requiresSpeedForLessonCredit(null), false);
});
