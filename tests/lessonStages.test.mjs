import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentModeForLesson, canCreditLessonMode } from '../src/core/training/lessonStages.ts';

test('lesson 10 requires seven Lookahead scores followed by Photo-memory', () => {
  for (let count = 0; count < 7; count++) {
    assert.equal(assessmentModeForLesson(10, count, 'reflex'), 'lookahead');
    assert.equal(canCreditLessonMode(10, count, 'lookahead'), true);
    assert.equal(canCreditLessonMode(10, count, 'photo'), false);
  }
  for (const count of [7, 8, 14, 15]) {
    assert.equal(assessmentModeForLesson(10, count, 'lookahead'), 'photo');
    assert.equal(canCreditLessonMode(10, count, 'photo'), true);
    assert.equal(canCreditLessonMode(10, count, 'lookahead'), false);
  }
});

test('other lessons and free practice do not change their selected mode', () => {
  assert.equal(assessmentModeForLesson(1, 10, 'reflex'), 'reflex');
  assert.equal(assessmentModeForLesson(11, 7, 'gpattern'), 'gpattern');
  assert.equal(assessmentModeForLesson(null, 7, 'hanon'), 'hanon');
  assert.equal(canCreditLessonMode(3, 20, 'reflex'), true);
});
