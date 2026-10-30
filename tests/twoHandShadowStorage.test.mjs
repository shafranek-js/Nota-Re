import test from 'node:test';
import assert from 'node:assert/strict';
import { initialShadowSeries, appendShadowAttempt } from '../src/core/training/twoHandShadowSeries.ts';
import {
  TWO_HAND_SHADOW_STORAGE_KEY, validateSavedTwoHandSeries,
  loadTwoHandShadowSeries, saveTwoHandShadowSeries,
  clearTwoHandShadowSeries, clearAllTwoHandShadowSeries
} from '../src/core/storage/twoHandShadowStorage.ts';

function verdict(studyIndex) {
  return { studyIndex, accepted: true, reasons: [], meanOnsetDeviationMs: 25,
    noteAccuracyPercent: 100, acceptedNoteReleases: 24,
    expectedNoteReleases: 24, officialCourseCredit: false };
}

test('reject tampered and inconsistent preparatory-series snapshots', () => {
  const good = { attempts: 2, accepted: 2, rejected: 0, aborted: 0,
    cleanStreak: 2, successfulStudies: [0, 1], lastAttemptId: 2 };
  assert.deepEqual(validateSavedTwoHandSeries(11, good)?.successfulStudies, [0, 1]);
  for (const invalid of [
    { ...good, successfulStudies: [0, 0] },
    { ...good, successfulStudies: [0, 15] },
    { ...good, attempts: -1 },
    { ...good, accepted: 3 },
    { ...good, cleanStreak: 1 },
    { ...good, lastAttemptId: 1 },
    { ...good, accepted: Number.NaN },
    { ...good, successfulStudies: Array(16).fill(0) }
  ]) assert.equal(validateSavedTwoHandSeries(11, invalid), null);
  assert.equal(validateSavedTwoHandSeries(12, { ...good, cleanStreak: 1 })?.cleanStreak, 1);
});

test('persist independent lesson 11 and 12 studies, never a timer or course credit', () => {
  const oldStorage = globalThis.localStorage;
  const map = new Map();
  globalThis.localStorage = {
    getItem: key => map.get(key) ?? null,
    setItem: (key, val) => { map.set(key, val); },
    removeItem: key => { map.delete(key); }
  };
  try {
    let lesson11 = initialShadowSeries(11);
    lesson11 = appendShadowAttempt(lesson11, 11, 1, verdict(0));
    lesson11 = appendShadowAttempt(lesson11, 11, 2, verdict(1));
    saveTwoHandShadowSeries(lesson11);
    let lesson12 = initialShadowSeries(12);
    lesson12 = appendShadowAttempt(lesson12, 12, 1, verdict(0));
    saveTwoHandShadowSeries(lesson12);
    const restored = loadTwoHandShadowSeries(11);
    assert.deepEqual(restored.successfulStudies, [0, 1]);
    assert.equal(restored.lastVerdict, null);
    assert.equal(restored.lastAttemptId, 2);
    assert.equal('officialCourseCredit' in restored, false);
    assert.equal(appendShadowAttempt(restored, 11, 2, verdict(2)), restored);
    assert.equal(appendShadowAttempt(restored, 11, 3, verdict(2)).successfulStudies.length, 3);
    assert.deepEqual(loadTwoHandShadowSeries(12).successfulStudies, [0]);
    clearTwoHandShadowSeries(11);
    assert.deepEqual(loadTwoHandShadowSeries(11).successfulStudies, []);
    assert.deepEqual(loadTwoHandShadowSeries(12).successfulStudies, [0]);
    map.set('notare_course_completed_v3', '[1]');
    clearAllTwoHandShadowSeries();
    assert.equal(map.has(TWO_HAND_SHADOW_STORAGE_KEY), false);
    assert.equal(map.get('notare_course_completed_v3'), '[1]');
    map.set(TWO_HAND_SHADOW_STORAGE_KEY, '{broken');
    assert.deepEqual(loadTwoHandShadowSeries(11), initialShadowSeries(11));
  } finally {
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
  }
});
