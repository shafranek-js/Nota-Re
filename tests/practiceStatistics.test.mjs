import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPracticeStats, noteStatisticsKey, intervalStatisticsKey,
  addPracticeObservation, addSelfPacedReflexAttempt, validatePracticeStats
} from '../src/core/training/practiceStatistics.ts';
import { loadPracticeStats, savePracticeStats, clearPracticeStats,
  PRACTICE_STATS_STORAGE_KEY } from '../src/core/storage/practiceStatsStorage.ts';

const c = { noteName: 'C4', clef: 'treble' }, e = { noteName: 'E4', clef: 'treble' };
const key = noteStatisticsKey('midi', 'reflex', c);
const obs = (outcome = 'correct', reactionMs = 410, extra = {}) => ({
  source: 'midi', mode: 'reflex', noteName: 'C4', clef: 'treble',
  outcome, reactionMs, at: 1700000000000, ...extra
});
function memory() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: k => data.delete(k),
    dump: () => Object.fromEntries(data)
  };
}

test('true note/interval observations preserve independent MIDI and PC contexts', () => {
  let state = emptyPracticeStats();
  state = addPracticeObservation(state, obs('wrong-pitch', null));
  state = addPracticeObservation(state, obs('correct', 900, { previousNoteName: 'E4', previousClef: 'treble' }));
  state = addPracticeObservation(state, obs('correct', 300, { source: 'pc' }));
  assert.deepEqual([state.notes[key].observations, state.notes[key].wrong,
    state.notes[key].correct, state.notes[key].reactionSamples],
    [2, 1, 1, 1]);
  assert.equal(state.notes[key].reactionSumMs, 900);
  assert.equal(state.notes[key].reactionEmaMs, 900);
  assert.equal(state.notes[noteStatisticsKey('pc', 'reflex', c)].reactionSumMs, 300);
  assert.equal(state.intervals[intervalStatisticsKey('midi', 'reflex', e, c)].observations, 1);
});

test('five genuinely fast clean hits retire error weight, not recorded mistakes or reaction history', () => {
  let state = addPracticeObservation(emptyPracticeStats(), obs('wrong-pitch', null));
  state = addPracticeObservation(state, obs('late', null));
  state = addPracticeObservation(state, obs('missed', null));
  assert.equal(state.notes[key].activeErrors, 3);
  for (let i = 0; i < 4; i++) state = addPracticeObservation(state, obs('correct', 440));
  assert.equal(state.notes[key].activeErrors, 3);
  assert.equal(state.notes[key].cleanStreak, 4);
  state = addPracticeObservation(state, obs('correct', 499));
  assert.equal(state.notes[key].activeErrors, 0);
  assert.equal(state.notes[key].wrong, 1);
  assert.equal(state.notes[key].late, 1);
  assert.equal(state.notes[key].missed, 1);
  assert.equal(state.notes[key].reactionSamples, 5);
  assert.equal(state.notes[key].reactionSumMs, 440 * 4 + 499);
  state = addPracticeObservation(state, obs('correct', null));
  assert.equal(state.notes[key].cleanStreak, 0, 'unknown reaction time is not a clean <500ms observation');
  state = addPracticeObservation(state, obs('wrong-pitch', null));
  assert.equal(state.notes[key].activeErrors, 1);
});

test('unverified/historic/assisted responses cannot populate practice metrics', () => {
  let state = emptyPracticeStats();
  state = addPracticeObservation(state, obs('correct', 100, { source: 'microphone' }));
  state = addPracticeObservation(state, obs('correct', -1));
  assert.equal(Object.keys(state.notes).length, 0);
  const history = [
    { noteIndex: 0, expectedNote: 'C4', playedNote: 'C4', outcome: 'correct', reactionMs: 250 },
    { noteIndex: 0, expectedNote: 'C4', playedNote: 'C4', outcome: 'assisted', reactionMs: 250, source: 'midi' },
    { noteIndex: 0, expectedNote: 'D4', playedNote: 'D4', outcome: 'correct', reactionMs: 250, source: 'midi' },
    { noteIndex: 3, expectedNote: 'C4', playedNote: 'C4', outcome: 'correct', reactionMs: 250, source: 'midi' },
    { noteIndex: 0, expectedNote: 'C4', playedNote: 'C4', outcome: 'correct', reactionMs: 250, source: 'midi' },
    { noteIndex: 1, expectedNote: 'E4', playedNote: null, outcome: 'missed', reactionMs: null }
  ];
  state = addSelfPacedReflexAttempt(state, history, [c, e], 1700000000000);
  assert.equal(state.notes[key].observations, 1);
  assert.equal(Object.keys(state.notes).length, 1);
});

test('versioned storage isolates stats, recovers corruption, and never touches course progress', () => {
  const store = memory();
  store.setItem('notare_course_completed_v3', '[1,2,3]');
  const state = addPracticeObservation(emptyPracticeStats(), obs('correct', 400));
  assert.equal(savePracticeStats(state, store), true);
  assert.equal(loadPracticeStats(store).notes[key].correct, 1);
  store.setItem(PRACTICE_STATS_STORAGE_KEY, 'not valid JSON');
  assert.deepEqual(loadPracticeStats(store), emptyPracticeStats());
  store.setItem(PRACTICE_STATS_STORAGE_KEY, JSON.stringify({ version: 999, notes: { bad: {} } }));
  assert.deepEqual(loadPracticeStats(store), emptyPracticeStats());
  assert.deepEqual(validatePracticeStats({ version: 1, notes: { [key]: { wrong: -1 } } }).notes, {});
  assert.equal(clearPracticeStats(store), true);
  assert.equal(store.getItem('notare_course_completed_v3'), '[1,2,3]');
  const blocked = { getItem: () => { throw Error('disabled'); },
    setItem: () => { throw Error('quota'); }, removeItem: () => { throw Error('disabled'); } };
  assert.deepEqual(loadPracticeStats(blocked), emptyPracticeStats());
  assert.equal(savePracticeStats(state, blocked), false);
  assert.equal(clearPracticeStats(blocked), false);
});
