import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRAINER_PREFERENCES, TRAINER_PREFERENCES_KEY,
  validateTrainerPreferences, selectTrainerPreferences,
  loadTrainerPreferences, saveTrainerPreferences
} from '../src/core/storage/trainerPreferences.ts';
import {
  validateCompletedLessons, loadCourseProgressFromStorage,
  saveCourseProgressToStorage
} from '../src/core/storage/progressStorage.ts';

const originalStorage = globalThis.localStorage;
function memoryStorage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
    entries
  };
}

test('trainer settings validate known modes and ranges field by field', () => {
  const result = validateTrainerPreferences({
    selectedLessonId: 8, currentAppMode: 'photo',
    currentFilter: 'treble_oct2', currentTonality: 'F', currentHanonType: 'groups4',
    speechSuppressor: 'solfege', bpm: 88, scoreNoteCount: 8,
    photoExposureMs: 1100, showScaleHighlight: true, zenModeEnabled: true,
    isBlindfolded: true, isTabletopMode: true, audioEnabled: false, metronomeEnabled: true
  });
  assert.equal(result.selectedLessonId, 8);
  assert.equal(result.currentAppMode, 'photo');
  assert.equal(result.currentTonality, 'F');
  assert.equal(result.bpm, 88);
  assert.equal(result.photoExposureMs, 1100);
  assert.equal(result.audioEnabled, false);
  assert.equal(result.metronomeEnabled, true);
  assert.equal(result.showScaleHighlight, true);
  assert.equal(result.zenModeEnabled, true);
  assert.equal(result.currentHanonType, 'groups4');
  assert.equal(result.scoreNoteCount, 8);
});

test('malformed values never crash or override defaults with invalid data', () => {
  assert.deepEqual(validateTrainerPreferences(null), DEFAULT_TRAINER_PREFERENCES);
  assert.deepEqual(validateTrainerPreferences([]), DEFAULT_TRAINER_PREFERENCES);
  const p = validateTrainerPreferences({
    selectedLessonId: -1, bpm: Infinity, scoreNoteCount: 10000,
    currentAppMode: 'admin', currentTonality: '__proto__', photoExposureMs: -8,
    isBlindfolded: 'true', zenModeEnabled: 'true', audioEnabled: 0, metronomeEnabled: 'true',
    currentFilter: 'bass' // preserve valid independent fields
  });
  assert.equal(p.selectedLessonId, 1);
  assert.equal(p.bpm, 60);
  assert.equal(p.scoreNoteCount, 16);
  assert.equal(p.currentAppMode, 'reflex');
  assert.equal(p.currentTonality, 'C');
  assert.equal(p.photoExposureMs, 1800);
  assert.equal(p.isBlindfolded, false);
  assert.equal(p.zenModeEnabled, true);
  assert.equal(DEFAULT_TRAINER_PREFERENCES.zenModeEnabled, true,
    'auto Zen is the default unless the user explicitly opts out');
  assert.equal(p.audioEnabled, true);
  assert.equal(p.metronomeEnabled, false);
  assert.equal(p.currentFilter, 'bass');
});

test('saved envelope is versioned and excludes flow/grades/MIDI runtime', () => {
  const store = memoryStorage();
  try {
    globalThis.localStorage = store;
    const snapshot = selectTrainerPreferences({
      ...DEFAULT_TRAINER_PREFERENCES,
      currentTonality: 'G', bpm: 100, zenModeEnabled: true, metronomeEnabled: true,
      isContinuousFlow: true, totalAttempts: 250, completedLessons: [1, 2]
    });
    saveTrainerPreferences(snapshot);
    const raw = store.getItem(TRAINER_PREFERENCES_KEY);
    const envelope = JSON.parse(raw);
    assert.equal(envelope.version, 2);
    assert.equal(envelope.preferences.bpm, 100);
    assert.equal(envelope.preferences.currentTonality, 'G');
    assert.equal(envelope.preferences.zenModeEnabled, true);
    assert.equal(envelope.preferences.metronomeEnabled, true);
    assert.equal('isContinuousFlow' in envelope.preferences, false);
    assert.equal('totalAttempts' in envelope.preferences, false);
    assert.equal('completedLessons' in envelope.preferences, false);
    assert.deepEqual(loadTrainerPreferences(), snapshot);
    store.setItem(TRAINER_PREFERENCES_KEY,
      JSON.stringify({ version: 1, preferences: { bpm: 103, currentTonality: 'D', zenModeEnabled: false } }));
    const migrated = loadTrainerPreferences();
    assert.equal(migrated.zenModeEnabled, true, 'old manual Zen false must not disable new auto default');
    assert.equal(migrated.bpm, 103, 'migration preserves exercise preferences');
    assert.equal(migrated.currentTonality, 'D');
    store.setItem(TRAINER_PREFERENCES_KEY,
      JSON.stringify({ version: 999, preferences: { bpm: 100 } }));
    assert.deepEqual(loadTrainerPreferences(), DEFAULT_TRAINER_PREFERENCES);
    store.setItem(TRAINER_PREFERENCES_KEY, '{invalid');
    assert.deepEqual(loadTrainerPreferences(), DEFAULT_TRAINER_PREFERENCES);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('older automatic keyboard labels migrate to note names without losing user choices', () => {
  const store = memoryStorage();
  try {
    globalThis.localStorage = store;
    const saved = { ...DEFAULT_TRAINER_PREFERENCES, keyboardLabelMode: 'auto', bpm: 85 };
    store.setItem(TRAINER_PREFERENCES_KEY,
      JSON.stringify({ version: 1, preferences: saved }));
    assert.equal(loadTrainerPreferences().keyboardLabelMode, 'notes');
    assert.equal(loadTrainerPreferences().bpm, 85, 'unrelated saved preferences survive migration');
    for (const mode of ['notes', 'off', 'pc']) {
      saved.keyboardLabelMode = mode;
      store.setItem(TRAINER_PREFERENCES_KEY,
        JSON.stringify({ version: 1, preferences: saved }));
      assert.equal(loadTrainerPreferences().keyboardLabelMode, mode,
        'explicit user selection must be preserved');
    }
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('course progress filters invalid and duplicate lesson IDs', () => {
  assert.deepEqual(validateCompletedLessons([1, '2', 2, 2, 13, 0, -1, 3.5, {}, 12]),
    [1, 2, 12]);
  const store = memoryStorage();
  try {
    globalThis.localStorage = store;
    store.setItem('notare_course_completed_v3', '[1,2,2,17,null,"3"]');
    assert.deepEqual(loadCourseProgressFromStorage(), [1, 2]);
    saveCourseProgressToStorage([2, 2, 7, 1000]);
    assert.deepEqual(JSON.parse(store.getItem('notare_course_completed_v3')), [2, 7]);
    store.setItem('notare_course_completed_v3', '{bad');
    assert.deepEqual(loadCourseProgressFromStorage(), []);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
