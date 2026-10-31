import test from 'node:test';
import assert from 'node:assert/strict';
import { directedInterval, directedIntervalLabel, parseSpelledPitch } from '../src/core/training/directedInterval.ts';
import { emptyPracticeStats, addPracticeObservation, addPracticeIntervalObservation,
  addSelfPacedReflexAttempt, intervalStatisticsKey, noteStatisticsKey, validatePracticeStats
} from '../src/core/training/practiceStatistics.ts';
import { weightedReflexCandidates, weightedReflexTransitions, chooseAdaptiveTransitions,
  generateAdaptiveReflexExercise } from '../src/core/generator/adaptiveReflex.ts';

const N = noteName => ({ noteName, clef: 'treble' });
const o = (from, to, outcome = 'wrong-pitch', source = 'pc', time = null) => ({
  source, mode: 'reflex', noteName: to, clef: 'treble', outcome, reactionMs: time,
  at: 1700000000000, previousNoteName: from, previousClef: 'treble'
});
const e = (i, target, outcome, played, source = 'pc', reactionMs = null) => ({
  noteIndex: i, expectedNote: target, playedNote: played, outcome, source, reactionMs
});
const opts = { mode: 'reflex', filter: 'treble', tonality: 'C',
  scoreNoteCount: 16, hanonType: 'hanon1' };

test('diatonic and chromatic identities preserve spelling, ascending/descending and octave', () => {
  assert.deepEqual(directedInterval(N('C4'), N('Db4')),
    { diatonicSteps: 1, chromaticSemitones: 1 });
  assert.deepEqual(directedInterval(N('C4'), N('C#4')),
    { diatonicSteps: 0, chromaticSemitones: 1 });
  assert.deepEqual(directedInterval(N('C4'), N('D4')),
    { diatonicSteps: 1, chromaticSemitones: 2 });
  assert.deepEqual(directedInterval(N('B3'), N('C4')),
    { diatonicSteps: 1, chromaticSemitones: 1 });
  assert.deepEqual(directedInterval(N('C5'), N('B4')),
    { diatonicSteps: -1, chromaticSemitones: -1 });
  assert.deepEqual(directedInterval(N('G4'), N('G4')),
    { diatonicSteps: 0, chromaticSemitones: 0 });
  assert.equal(parseSpelledPitch('H4'), null);
  assert.equal(directedInterval(N('invalid'), N('C4')), null);
  assert.notEqual(intervalStatisticsKey('pc','reflex',N('C4'),N('Db4')),
    intervalStatisticsKey('pc','reflex',N('C4'),N('C#4')));
  assert.match(directedIntervalLabel(directedInterval(N('C4'),N('Db4'))), /ступени \+1, полутоны \+1/);
});

test('only verified consecutive targets form interval observations; corrected second target is one error', () => {
  const score = [N('C4'), N('E4'), N('G4'), N('C5')];
  const events = [
    e(0,'C4','correct','C4','pc',400),
    e(1,'E4','wrong-pitch','D4'),
    e(1,'E4','wrong-pitch','D4'),
    e(1,'E4','correct','E4','pc',300),
    e(2,'G4','correct','G4','pc',300),
    e(3,'C5','correct','C5','midi',500)
  ];
  const state = addSelfPacedReflexAttempt(emptyPracticeStats(),events,score,1700000000000);
  const cToE = state.intervals[intervalStatisticsKey('pc','reflex',N('C4'),N('E4'))];
  assert.deepEqual([cToE.observations,cToE.wrong,cToE.activeErrors,cToE.reactionSamples],
    [1,1,1,0]);
  assert.equal(state.intervals[intervalStatisticsKey('pc','reflex',N('E4'),N('G4'))],undefined,
    'correction on previous note invalidates following clean interval');
  assert.equal(state.intervals[intervalStatisticsKey('midi','reflex',N('G4'),N('C5'))],undefined,
    'do not combine input sources');
  assert.equal(state.notes[noteStatisticsKey('pc','reflex',N('E4'))].wrong,2,
    'individual wrong attempts remain factual');
});

test('a clean PC pair has its own target-response timing; MIDI has no uncalibrated latency', () => {
  const score=[N('C4'),N('D4')];
  const pc=addSelfPacedReflexAttempt(emptyPracticeStats(),[
    e(0,'C4','correct','C4','pc',600),e(1,'D4','correct','D4','pc',400)
  ],score,1700000000000);
  const pair=pc.intervals[intervalStatisticsKey('pc','reflex',N('C4'),N('D4'))];
  assert.equal(pair.correct,1);assert.equal(pair.reactionSamples,1);
  assert.equal(pair.reactionSumMs,400);
  const midi=addSelfPacedReflexAttempt(emptyPracticeStats(),[
    e(0,'C4','correct','C4','midi',600),e(1,'D4','correct','D4','midi',400)
  ],score,1700000000000);
  assert.equal(midi.intervals[intervalStatisticsKey('midi','reflex',N('C4'),N('D4'))].reactionSamples,0);
});

test('v1 legacy notes migrate intact while unverifiable v1 interval statistics are discarded', () => {
  let old=addPracticeObservation(emptyPracticeStats(),
    {source:'pc',mode:'reflex',noteName:'C4',clef:'treble',outcome:'wrong-pitch',
      reactionMs:null,at:1700000000000});
  const pair=intervalStatisticsKey('pc','reflex',N('C4'),N('D4'));
  old=addPracticeIntervalObservation(old,o('C4','D4'));
  const legacy={...old,version:1,intervals:{
    'pc:reflex:treble:C4:to:treble:D4':old.intervals[pair]}};
  const migrated=validatePracticeStats(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migrated.version,2);
  assert.equal(migrated.notes[noteStatisticsKey('pc','reflex',N('C4'))].wrong,1);
  assert.deepEqual(migrated.intervals,{});
  const reloaded=validatePracticeStats(JSON.parse(JSON.stringify(old)));
  assert.equal(reloaded.intervals[pair].activeErrors,1);
  const forged={...old,intervals:{...old.intervals,[pair.replace('d+1','d+9')]:old.intervals[pair]}};
  assert.equal(Object.keys(validatePracticeStats(forged).intervals).length,1,
    'recomputed diatonic identity rejects a forged mislabeled interval');
});

test('interval trouble increases eligible directed transition frequency, not just target pitch', () => {
  let stats=emptyPracticeStats();
  for(let i=0;i<15;i++)stats=addPracticeIntervalObservation(stats,o('C4','E4'));
  const notes=weightedReflexCandidates(['C4','D4','E4','F4','G4'],stats,'pc');
  assert.ok(notes.every(n=>n.weight===1),'no note-only evidence');
  const shifted=weightedReflexTransitions(notes,'C4',stats,'pc');
  assert.equal(shifted.find(n=>n.noteName==='E4').intervalBoost,1.5);
  assert.equal(shifted.find(n=>n.noteName==='E4').totalWeight,2.5);
  assert.equal(shifted.find(n=>n.noteName==='D4').totalWeight,1);
  assert.equal(weightedReflexTransitions(notes,'D4',stats,'pc')
    .find(n=>n.noteName==='E4').intervalBoost,0);
  let harder=0,easier=0;
  for(let seed=1;seed<=350;seed++){
    const seq=chooseAdaptiveTransitions(notes,16,seed,stats,'pc').chosen;
    for(let i=1;i<seq.length;i++){
      if(seq[i-1]!=='C4')continue;
      harder+=Number(seq[i]==='E4');
      easier+=Number(seq[i]==='D4');
    }
  }
  assert.ok(harder>easier*1.35,`biased transition selection ${harder} vs ${easier}`);
  assert.ok(easier>0,'clean intervals must remain reachable');
  const a=generateAdaptiveReflexExercise(opts,stats,'pc',718);
  const b=generateAdaptiveReflexExercise(opts,stats,'pc',718);
  assert.deepEqual(a,b,'same stats, preset, source and seed produce identical complete trace');
  assert.equal(a.trace.steps.length,16);
  for(let i=2;i<16;i++)assert.ok(!(a.trace.chosen[i]===a.trace.chosen[i-1] &&
    a.trace.chosen[i-1]===a.trace.chosen[i-2]));
});
