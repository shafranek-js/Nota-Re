import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_SERIES_STORAGE_KEY, validateLessonEvidence, validateCourseSeries,
  loadCourseSeriesFromStorage, saveCourseSeriesToStorage, clearCourseSeriesFromStorage
} from '../src/core/storage/courseSeriesStorage.ts';

const evidence = {
  completedExercises: 6, judgedNotes: 96, correctNotes: 91,
  reactionTotalMs: 91 * 450, reactionSamples: 91
};

test('reject malformed or inflated course evidence', () => {
  assert.deepEqual(validateLessonEvidence(evidence), evidence);
  for (const corrupt of [
    { ...evidence, completedExercises: -1 }, { ...evidence, completedExercises: 6.5 },
    { ...evidence, judgedNotes: 5 }, { ...evidence, correctNotes: 97 },
    { ...evidence, reactionSamples: 92 }, { ...evidence, reactionTotalMs: NaN },
    { ...evidence, reactionTotalMs: Infinity }, { ...evidence, reactionTotalMs: -1 },
    { completedExercises: 6 }
  ]) assert.equal(validateLessonEvidence(corrupt), null);
});

test('version validation and per-lesson recovery reject invalid records', () => {
  assert.deepEqual(validateCourseSeries({ version: 2, lessons: { 1: evidence } }), {});
  assert.deepEqual(validateCourseSeries({ version: 1, lessons: {
    1: evidence, 2: { ...evidence, correctNotes: -1 },
    13: evidence, '01': evidence
  } }), { 1: evidence });
});

test('save, restore and clear incomplete series without touching course completion', () => {
  const oldStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); }
  };
  try {
    assert.deepEqual(loadCourseSeriesFromStorage(), {});
    saveCourseSeriesToStorage({ 1: evidence, 5: { ...evidence, completedExercises: 1 } });
    assert.deepEqual(JSON.parse(data.get(COURSE_SERIES_STORAGE_KEY)).version, 1);
    assert.deepEqual(loadCourseSeriesFromStorage(),
      { 1: evidence, 5: { ...evidence, completedExercises: 1 } });
    data.set('notare_course_completed_v3', '[1]');
    clearCourseSeriesFromStorage();
    assert.deepEqual(loadCourseSeriesFromStorage(), {});
    assert.equal(data.get('notare_course_completed_v3'), '[1]');
    data.set(COURSE_SERIES_STORAGE_KEY, '{broken-json');
    assert.deepEqual(loadCourseSeriesFromStorage(), {});
  } finally {
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
  }
});
