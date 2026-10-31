import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccompanimentStudy } from '../src/core/training/accompanimentStudy.ts';
import { createChordStudy } from '../src/core/training/chordStudy.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import { reduceChordPractice, initialChordPractice } from '../src/core/training/twoHandPractice.ts';
import { reduceTimedPractice, initialTimedPractice } from '../src/core/training/tempoTwoHand.ts';
import { assessPolyphonicPractice } from '../src/core/training/polyphonicAssessment.ts';

const cases = [
  ['C', 'major', 0, ['C3','E3','G3']],
  ['C', 'minor', 0, ['A2','C3','E3']],
  ['G', 'major', 1, ['G2','B2','D3']],
  ['G', 'minor', 1, ['E3','G3','B3']],
  ['F', 'major', -1, ['F2','A2','C3']],
  ['F', 'minor', -1, ['D3','F3','A3']],
  ['D', 'major', 2, ['D3','F#3','A3']],
  ['D', 'minor', 2, ['B2','D3','F#3']]
];

for (const [key, quality, fifths, bass] of cases) {
  test(`${key} / ${quality}: 3 textures, 3 RH inversions, 3/4 accurate staves and both/left evidence`, () => {
    for (const inversion of [0,1,2]) for (const texture of ['alberti','waltz','arpeggio']) {
      const both = createAccompanimentStudy(key, quality, inversion, texture, 'both');
      const left = createAccompanimentStudy(key, quality, inversion, texture, 'left');
      const barTicks = texture === 'waltz' ? 12 : 16;
      const beats = texture === 'waltz' ? 3 : 4;
      assert.deepEqual(both, createAccompanimentStudy(key, quality, inversion, texture, 'both'),
        'deterministic fixture');
      assert.equal(both.score.beats, beats);
      assert.equal(both.score.fifths, fifths);
      assert.equal(both.score.mode, quality);
      assert.deepEqual(both.rightNotes, createChordStudy(key,quality,inversion).pitchNames);
      assert.deepEqual(both.leftNotes, bass);
      assert.equal(both.score.notes.filter(n=>n.staff===1).length,6);
      assert.equal(left.score.notes.filter(n=>n.staff===1).length,0);
      assert.deepEqual(left.score.notes.filter(n=>n.staff===2),
        both.score.notes.filter(n=>n.staff===2),'left-only is exactly the same score LH');
      const right=both.score.notes.filter(n=>n.staff===1);
      assert.ok(right.every(n=>n.durationTicks===barTicks));
      assert.deepEqual([...new Set(right.map(n=>n.onsetTicks))],[0,barTicks]);
      assert.equal(both.score.notes.at(-1).onsetTicks < 2*barTicks,true);
      assert.deepEqual(both.steps.map(s=>s.onsetTicks), left.steps.map(s=>s.onsetTicks),
        'independent RH chord downbeats share a real LH attack and never shift time');
      const xml=toMusicXml(both.score);
      assert.match(xml,new RegExp(`<time><beats>${beats}<\\/beats><beat-type>4<\\/beat-type><\\/time>`));
      assert.match(xml,new RegExp(`<key><fifths>${fifths}<\\/fifths><mode>${quality}<\\/mode><\\/key>`));
      assert.equal((xml.match(/<measure number="/g)||[]).length,2);
      assert.equal((xml.match(new RegExp(`<backup><duration>${barTicks}<\\/duration><\\/backup>`,'g'))||[]).length,2);
      assert.equal((xml.match(/<chord\/>/g)||[]).length,
        texture === 'waltz' ? 8 : 4,'correct upper LH dyads and RH triads, never a fake unison');
      assert.equal((toMusicXml(left.score).match(/<chord\/>/g)||[]).length,
        texture === 'waltz' ? 4 : 0);
      if(texture==='waltz'){
        assert.equal(both.steps.length,6);
        assert.deepEqual(left.steps.map(s=>s.onsetTicks),[0,4,8,12,16,20]);
        assert.deepEqual(left.score.notes.filter(n=>n.staff===2 && n.onsetTicks<12)
          .map(n=>[n.onsetTicks,n.durationTicks]),[
          [0,4],[4,4],[4,4],[8,4],[8,4]
        ]);
      }else{
        assert.equal(both.steps.length,16);
        const lh=both.score.notes.filter(n=>n.staff===2);
        assert.deepEqual(lh.map(n=>n.onsetTicks),Array.from({length:16},(_,i)=>i*2));
        assert.ok(lh.every(n=>n.durationTicks===2));
        assert.deepEqual(lh.slice(0,4).map(n=>n.midi),
          texture==='alberti' ? [lh[0].midi,lh[2].midi,lh[4].midi,lh[2].midi] :
            [lh[0].midi,lh[1].midi,lh[2].midi,lh[1].midi]);
      }
    }
  });
}

test('metronome timestamps use true independent 3/4 onsets, reject missing RH attacks',()=>{
  const both=createAccompanimentStudy('C','major',0,'waltz','both');
  let state=initialTimedPractice();
  const plan={startMs:1000,bpm:60,windowMs:160,overlapMs:140,holdGraceMs:120};
  state=reduceTimedPractice(state,both.score,both.steps,plan,{type:'tick',receivedAtMs:1000});
  assert.equal(state.stepIndex,0);
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-on',channel:0,note:48,receivedAtMs:1000});
  assert.equal(state.hits,0,'LH bass cannot substitute for RH triad at shared onset');
  assert.equal(state.feedback,'partial');
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-on',channel:0,note:60,receivedAtMs:1010});
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-on',channel:0,note:64,receivedAtMs:1020});
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-on',channel:0,note:67,receivedAtMs:1030});
  assert.equal(state.hits,1,'true cross-staff harmonic attack');
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-off',channel:0,note:48,receivedAtMs:1970});
  assert.equal(state.earlyReleases,0,'quarter LH bass released at its notated ending');
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'tick',receivedAtMs:2010});
  assert.equal(state.stepIndex,1,'beat two occurs at one quarter = 1000ms, not at 4/4 bar');
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-on',channel:0,note:52,receivedAtMs:2030});
  state=reduceTimedPractice(state,both.score,both.steps,plan,
    {type:'note-on',channel:0,note:55,receivedAtMs:2080});
  assert.equal(state.hits,2,'beat two dyad genuinely held together');
  assert.equal(state.stepIndex,2);
  const assessment=assessPolyphonicPractice(both.score,both.steps,state);
  assert.equal(assessment.readyForCourseTrial,false,
    'incomplete MIDI does not grant certification or readiness');
});

test('left-only practice has no phantom RH hits and accepts single-note Alberti onsets',()=>{
  const score=createAccompanimentStudy('C','major',0,'alberti','left');
  assert.equal(score.score.notes.filter(n=>n.staff===1).length,0);
  let state=initialChordPractice();
  state=reduceChordPractice(state,score.steps,{type:'note-on',note:48,channel:0,receivedAtMs:200});
  assert.equal(state.stepIndex,1);
  state=reduceChordPractice(state,score.steps,{type:'note-off',note:48,channel:0});
  state=reduceChordPractice(state,score.steps,{type:'note-on',note:55,channel:0,receivedAtMs:260});
  assert.equal(state.stepIndex,2);
  state=reduceChordPractice(state,score.steps,{type:'note-on',note:52,channel:0,receivedAtMs:310});
  assert.equal(state.stepIndex,3);
  for(const args of [
    ['C','major',0,'invalid','both'],
    ['C','major',0,'waltz','invalid'],
    ['X','minor',0,'alberti','left']
  ]) assert.throws(()=>createAccompanimentStudy(...args),/Unsupported/);
});

test('fixed 4/4 score remains byte-equivalent to default timed-hands generator',async()=>{
  const {createScoreFromTimedHands}=await import('../src/core/notation/musicXml.ts');
  const rh=[{midi:60,onsetTicks:0,durationTicks:4}];
  const lh=[{midi:48,onsetTicks:0,durationTicks:8}];
  const a=createScoreFromTimedHands(rh,lh,'C','Unchanged');
  const b=createScoreFromTimedHands(rh,lh,'C','Unchanged',4);
  assert.deepEqual(a,b);
  assert.equal(toMusicXml(a),toMusicXml(b));
  assert.match(toMusicXml(a),/<time><beats>4<\/beats><beat-type>4<\/beat-type><\/time>/);
  assert.throws(()=>createScoreFromTimedHands(rh,lh,'C','Bad',5),/Unsupported generated meter/);
});
