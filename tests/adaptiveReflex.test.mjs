import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPracticeStats, addPracticeObservation,
  noteStatisticsKey } from '../src/core/training/practiceStatistics.ts';
import { generateAdaptiveReflexExercise, weightedReflexCandidates,
  reflexPitchPool, chooseAdaptiveNotes } from '../src/core/generator/adaptiveReflex.ts';
const options = (tonality = 'C', filter = 'treble') => ({
  mode: 'reflex', filter, tonality, scoreNoteCount: 16, hanonType: 'hanon1'
});
const obs = (noteName, outcome, ms = null) => ({
  source: 'pc', mode: 'reflex', noteName, clef: 'treble',
  outcome, reactionMs: ms, at: 1700000000000
});
test('same seed, stats and preset produce identical score and trace', () => {
  const stats = emptyPracticeStats();
  const a = generateAdaptiveReflexExercise(options(), stats, 'pc', 123);
  const b = generateAdaptiveReflexExercise(options(), stats, 'pc', 123);
  assert.deepEqual(a, b);
  assert.equal(a.notes.length, 16);
  assert.deepEqual(a.notes.map(n => n.id), Array.from({ length: 16 }, (_, i) => i));
  assert.equal(a.notes[0].status, 'current');
  assert.ok(a.notes.slice(1).every(n => n.status === 'pending'));
  for (let i = 2; i < 16; i++) {
    assert.ok(!(a.notes[i].noteName === a.notes[i - 1].noteName &&
      a.notes[i - 1].noteName === a.notes[i - 2].noteName), 'no three in row');
  }
});
test('weights are bounded, difficult pitch gets higher probability, others never starve', () => {
  let stats = emptyPracticeStats();
  for (let i = 0; i < 20; i++) stats = addPracticeObservation(stats, obs('D4', 'wrong-pitch'));
  stats = addPracticeObservation(stats, obs('D4', 'correct', 1000));
  const pool = reflexPitchPool(options());
  const candidates = weightedReflexCandidates(pool, stats, 'pc');
  const d = candidates.find(c => c.noteName === 'D4');
  assert.equal(d.weight, 3.5); // 20 errors and slow response
  assert.equal(candidates.find(c => c.noteName === 'C4').weight, 1);
  assert.equal(weightedReflexCandidates(pool, stats, 'midi').find(c => c.noteName === 'D4').weight, 1);
  let difficult = 0, neutral = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const picked = chooseAdaptiveNotes(candidates, 16, seed);
    difficult += picked.filter(p => p === 'D4').length;
    neutral += picked.filter(p => p === 'C4').length;
  }
  assert.ok(difficult > neutral * 1.7, 'more errors should increase chance');
  assert.ok(neutral > 0, 'clean notes must never starve');
});
test('candidate generation honors clef/range, key spelling and denies unsupported flow', () => {
  assert.ok(reflexPitchPool(options('G')).includes('F#4'));
  assert.ok(!reflexPitchPool(options('G')).includes('F4'));
  assert.ok(reflexPitchPool(options('F', 'bass')).includes('Bb3'));
  assert.ok(!reflexPitchPool(options('F', 'bass')).includes('B3'));
  assert.ok(reflexPitchPool(options('D', 'treble_oct2')).includes('C#5'));
  for (const filter of ['treble','bass','treble_oct2']) {
    const o = options('F', filter);
    const result = generateAdaptiveReflexExercise(o, emptyPracticeStats(), 'pc', 4);
    assert.ok(result.notes.every(n => reflexPitchPool(o).includes(n.noteName)));
  }
  assert.throws(() => generateAdaptiveReflexExercise(options('C','both'),
    emptyPracticeStats(), 'pc', 1), /single-staff/);
  assert.throws(() => generateAdaptiveReflexExercise({ ...options(), mode: 'photo' },
    emptyPracticeStats(), 'pc', 1), /single-staff/);
  assert.throws(() => chooseAdaptiveNotes([], 16, 1), /Invalid/);
  assert.throws(() => chooseAdaptiveNotes([{ noteName: 'C4', weight: -1 }], 16, 1), /Invalid/);
});
test('historical mistakes remain in evidence but five clean observations retire their boost', () => {
  let stats = addPracticeObservation(emptyPracticeStats(), obs('D4', 'wrong-pitch'));
  for (let i=0; i<5; i++) stats = addPracticeObservation(stats, obs('D4','correct',400));
  assert.equal(stats.notes[noteStatisticsKey('pc','reflex',
    {noteName:'D4',clef:'treble'})].wrong, 1);
  assert.equal(weightedReflexCandidates(['D4'], stats, 'pc')[0].weight, 1);
});
