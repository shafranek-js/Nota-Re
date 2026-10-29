import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_CURRICULUM } from '../src/data/curriculum.ts';
import { getTwoHandCourseTrialPreset } from '../src/core/training/twoHandCourseTrial.ts';

test('lesson 11 and 12 examples inherit curriculum tempo but have separate RH/LH rhythms', () => {
  const lesson11 = getTwoHandCourseTrialPreset(11);
  const lesson12 = getTwoHandCourseTrialPreset(12);
  assert.ok(lesson11 && lesson12);
  assert.equal(lesson11.pattern, 'staggered');
  assert.equal(lesson12.pattern, 'eighth-rests');
  for (const trial of [lesson11, lesson12]) {
    const lesson = COURSE_CURRICULUM.find(x => x.id === trial.lessonId);
    assert.equal(trial.bpm, lesson.preset.bpm);
    assert.equal(trial.tonality, lesson.preset.tonality);
    assert.ok(trial.description.includes('не ') || trial.description.includes('ещё не'));
    assert.equal('creditedRepetitions' in trial, false);
    assert.equal('completedLessons' in trial, false);
  }
});

test('other lesson IDs never create an unofficial two-hand exam', () => {
  for (const id of [null, 0, -1, 1, 3, 10, 13, 99, NaN]) {
    assert.equal(getTwoHandCourseTrialPreset(id), null);
  }
});
