import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccompanimentStudy } from '../src/core/training/accompanimentStudy.ts';
import { harmonicMinorDominant, writtenPitchFromName } from '../src/core/training/harmonicMinor.ts';
import { toMusicXml, createScoreFromTimedHands } from '../src/core/notation/musicXml.ts';
import { createChordStudy } from '../src/core/training/chordStudy.ts';
import { reduceChordPractice, initialChordPractice } from '../src/core/training/twoHandPractice.ts';
import { reduceTimedPractice, initialTimedPractice } from '../src/core/training/tempoTwoHand.ts';

const keys = [
  { key:'C',fifths:0,tonic:'A',lead:'G#',left:['E3','G#3','B3'],
    v0:['E4','G#4','B4'],pitchClass:8 },
  { key:'G',fifths:1,tonic:'E',lead:'D#',left:['B2','D#3','F#3'],
    v0:['B4','D#5','F#5'],pitchClass:3 },
  { key:'F',fifths:-1,tonic:'D',lead:'C#',left:['A2','C#3','E3'],
    v0:['A4','C#5','E5'],pitchClass:1 },
  { key:'D',fifths:2,tonic:'B',lead:'A#',left:['F#2','A#2','C#3'],
    v0:['F#4','A#4','C#5'],pitchClass:10 }
];

for (const k of keys) {
  test(`harmonic minor ${k.tonic}: explicit leading tone, major V and i resolution across every meter/inversion`,()=>{
    for(const inversion of [0,1,2]) for(const texture of ['alberti','waltz','arpeggio']) {
      const dom=harmonicMinorDominant(k.key,inversion);
      assert.equal(dom.tonic,k.tonic);
      assert.equal(dom.leadingTone,k.lead);
      assert.deepEqual(dom.left,k.left);
      if(inversion===0)assert.deepEqual(dom.right,k.v0);
      const barTicks=texture==='waltz'?12:16;
      const beats=texture==='waltz'?3:4;
      for(const [hands,shift] of [['both',0],['left',0],['left',12]]) {
        const result=createAccompanimentStudy(k.key,'minor',inversion,texture,hands,shift,'harmonic');
        const tonic=createChordStudy(k.key,'minor',inversion);
        const shiftNote=(n)=>n.replace(/([0-8])$/,(_,o)=>String(Number(o)+shift/12));
        assert.equal(result.minorForm,'harmonic');
        assert.equal(result.quality,'minor');
        assert.equal(result.score.mode,'minor');
        assert.equal(result.score.fifths,k.fifths,'local chromatic raised 7 is never a key-signature change');
        assert.equal(result.score.beats,beats);
        assert.equal(result.leadingTone,k.lead);
        assert.deepEqual(result.leftNotes,k.left.map(shiftNote));
        assert.deepEqual(result.resolutionRightNotes,tonic.pitchNames);
        assert.deepEqual(result.resolutionLeftNotes,
          createAccompanimentStudy(k.key,'minor',inversion,texture,'left',shift).leftNotes);
        assert.deepEqual(result.rightNotes,dom.right);
        assert.ok(result.score.notes.every(n=>n.spelling &&
          Number.isInteger(n.spelling.octave)),'all harmonic cadence notes explicitly spelled');
        assert.equal(result.score.notes.filter(n=>n.staff===1).length,hands==='both'?6:0);
        const first=result.score.notes.filter(n=>n.onsetTicks<barTicks);
        const second=result.score.notes.filter(n=>n.onsetTicks>=barTicks);
        assert.ok(first.some(n=>n.midi%12===k.pitchClass),'V must actually contain raised 7');
        assert.ok(!second.some(n=>n.midi%12===k.pitchClass),'tonic i must resolve raised 7');
        const expectedFirst=dom.right.map(n=>writtenPitchFromName(n).midi);
        const expectedSecond=tonic.pitchNames.map(n=>writtenPitchFromName(n).midi);
        if(hands==='both'){
          assert.deepEqual(result.steps[0].expectedMidi.filter(m=>expectedFirst.includes(m)).length,3);
          assert.deepEqual(result.steps.find(s=>s.onsetTicks===barTicks).expectedMidi
            .filter(m=>expectedSecond.includes(m)).length,3);
        }
        const xml=toMusicXml(result.score);
        assert.match(xml,new RegExp(`<key><fifths>${k.fifths}<\\/fifths><mode>minor<\\/mode><\\/key>`));
        assert.match(xml,new RegExp(`<time><beats>${beats}<\\/beats><beat-type>4<\\/beat-type><\\/time>`));
        assert.equal((xml.match(/<measure number="/g)||[]).length,2);
        assert.ok(xml.includes('<accidental>sharp</accidental>'),
          'OSMD receives visible chromatic alteration, not only equal temperament pitch');
        assert.ok(xml.includes(`<pitch><step>${k.lead[0]}</step><alter>1</alter>`),
          'raised 7 must be spelled by its correct diatonic letter');
        assert.equal((xml.match(/<backup><duration>\d+<\/duration><\/backup>/g)||[]).length,2);
        if(hands==='left'&&shift===12){
          assert.ok(result.score.notes.every(n=>n.staff===2&&n.midi>=48&&n.midi<=72),
            'short-keyboard LH-only study is physically C3–C5 playable');
        }
        assert.deepEqual(result,createAccompanimentStudy(k.key,'minor',inversion,texture,hands,shift,'harmonic'),
          'deterministic target & rhythmic timeline');
      }
      const natural=createAccompanimentStudy(k.key,'minor',inversion,texture,'both',0,'natural');
      assert.deepEqual(natural,createAccompanimentStudy(k.key,'minor',inversion,texture,'both',0),
        'omitting opt-in leaves natural minor exactly unchanged');
      assert.ok(natural.score.notes.every(n=>n.spelling===undefined),
        'legacy notation is not re-spelled or re-graded');
      assert.notDeepEqual(natural.steps[0].expectedMidi,
        createAccompanimentStudy(k.key,'minor',inversion,texture,'both',0,'harmonic').steps[0].expectedMidi);
    }
  });
}

test('MusicXML accidentals reset per measure, not on every repeat within a bar',()=>{
  const n=(midi,spelling,onsetTicks)=>({midi,spelling,onsetTicks,durationTicks:4});
  const gSharp={step:'G',alter:1,octave:4};
  const gNatural={step:'G',alter:0,octave:4};
  const score=createScoreFromTimedHands([
    n(68,gSharp,0),n(68,gSharp,4),n(67,gNatural,8),
    n(68,gSharp,12)
  ],[],'C','Accidental memory',3);
  const xml=toMusicXml(score);
  assert.equal((xml.match(/<accidental>sharp<\/accidental>/g)||[]).length,2);
  assert.equal((xml.match(/<accidental>natural<\/accidental>/g)||[]).length,1);
  assert.equal((xml.match(/<measure number="/g)||[]).length,2);
  assert.throws(()=>toMusicXml({...score,notes:[n(67,gSharp,0)]}),
    /Written pitch conflicts/);
  assert.throws(()=>toMusicXml({...score,notes:[n(68,{...gSharp,octave:3},0)]}),
    /Written pitch conflicts/);
});

test('MIDI cannot certify V–i cadence from LH alone in both-hand mode',()=>{
  const study=createAccompanimentStudy('C','minor',0,'waltz','both',0,'harmonic');
  const first=study.steps[0];
  assert.deepEqual(first.expectedMidi,[52,64,68,71]);
  let free=initialChordPractice();
  free=reduceChordPractice(free,study.steps,{type:'note-on',note:52,channel:0,receivedAtMs:100});
  assert.equal(free.stepIndex,0);
  for(const [m,t] of [[64,120],[68,130],[71,140]])
    free=reduceChordPractice(free,study.steps,{type:'note-on',note:m,channel:0,receivedAtMs:t});
  assert.equal(free.stepIndex,1,'only physical V chord plus bass advances');
  const timed=reduceTimedPractice(initialTimedPractice(),study.score,study.steps,
    {startMs:1000,bpm:60,windowMs:160,overlapMs:140,holdGraceMs:120},
    {type:'note-on',note:52,channel:0,receivedAtMs:1000});
  assert.equal(timed.hits,0,'a lone V bass is no substitute for right-hand dominant');
  assert.equal(timed.feedback,'partial');
});

test('mode parameter rejects harmonic major, missing keys, invalid inversion and wrong transposition',()=>{
  for(const args of [
    ['C','major',0,'alberti','both',0,'harmonic'],
    ['Z','minor',0,'waltz','left',0,'harmonic'],
    ['C','minor',3,'waltz','left',0,'harmonic'],
    ['F','minor',0,'waltz','both',12,'harmonic']
  ]) assert.throws(()=>createAccompanimentStudy(...args),/Unsupported/);
  assert.throws(()=>harmonicMinorDominant('C',3),/Unsupported/);
  assert.throws(()=>writtenPitchFromName('Gb#4'),/Unsupported/);
});
