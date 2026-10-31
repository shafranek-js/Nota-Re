import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScoreDocument,quarter,selectScoreMeasures} from '../src/core/notation/scoreDocument.ts';
import {planPolyphonicRehearsal,startPolyphonicTrial,recordPolyphonicKey} from '../src/core/training/repertoirePolyphonicTrial.ts';
const q=quarter;
const pitch=(midi)=>{
 const spelling={48:['C',3],55:['G',3],57:['A',3],60:['C',4],62:['D',4],64:['E',4],67:['G',4]};
 const [step,octave]=spelling[midi];
 return {step,octave,alter:0,midi};
};
const makeNote=(id,staff,voice,onset,duration,midi)=>({
 id,partId:'P1',measureId:'bar1',staff,voice,kind:'note',
 onset:q(onset),duration:q(duration),pitch:pitch(midi)
});
const score=()=>normalizeScoreDocument({
 schemaVersion:1,id:'voices',title:'Two voices on both staves',
 source:'imported',parts:[{id:'P1',name:'Piano',staves:2}],
 measures:[{id:'bar1',printedNumber:'1',start:q(0),duration:q(4),
  meter:{beats:4,beatType:4}}],
 events:[
  makeNote('rh-long',1,'1',0,2,60),
  makeNote('rh-next',1,'1',2,2,62),
  makeNote('rh-alt',1,'2',0,1,64),
  makeNote('rh-alt-next',1,'2',1,1,67),
  makeNote('lh-long',2,'3',0,4,57),
  makeNote('lh-alt',2,'4',1,2,55)
 ],
 tempos:[{onset:q(0),quarterBpm:120}]
});
const range=s=>selectScoreMeasures(s,'bar1','bar1');
const on=note=>({type:'note-on',note});
const off=note=>({type:'note-off',note});
test('independent voices on both staves retain true onsets, chords and held overlapping pitches',()=>{
 const s=score(),before=JSON.stringify(s),plan=planPolyphonicRehearsal(s,range(s),'both');
 assert.equal(plan.reason,null);
 assert.deepEqual(plan.steps.map(x=>x.targets.map(n=>n.midi)),
  [[60,64,57],[67,55],[62]]);
 assert.deepEqual(plan.steps[1].requiredHeld,[60,57]);
 assert.deepEqual(plan.steps[2].requiredHeld,[57,55]);
 assert.equal(JSON.stringify(s),before,'MusicXML timeline must remain immutable');
});
test('release of long independent RH voice before next attack never earns correct group',()=>{
 const s=score(),p=planPolyphonicRehearsal(s,range(s),'right');
 assert.equal(p.reason,null);
 assert.deepEqual(p.steps.map(x=>x.targets.map(y=>y.midi)),[[60,64],[67],[62]]);
 let state=startPolyphonicTrial(p);
 for(const midi of [60,64])state=recordPolyphonicKey(state,p,on(midi));
 assert.equal(state.correct,1);
 state=recordPolyphonicKey(state,p,off(60));
 state=recordPolyphonicKey(state,p,on(67));
 assert.equal(state.wrong,1);
 assert.equal(state.correct,1);
 assert.equal(state.completedStepIndex,null);
 state=recordPolyphonicKey(state,p,on(62));
 assert.equal(state.phase,'complete');
 assert.equal(state.correct,2);
});
test('additive companion can overlap two batches without truncating earlier sounding voice',()=>{
 const s=score(),p=planPolyphonicRehearsal(s,range(s),'right');
 assert.equal(p.reason,null);
 assert.equal(p.steps[0].companion.length,1);
 assert.equal(p.steps[1].companion.length,1);
 assert.ok(p.steps[0].companion[0].durationSeconds>1.8);
 assert.ok(p.steps[1].companion[0].durationSeconds>0.9);
 assert.equal(p.steps[1].companion[0].offsetSeconds,0);
 assert.equal(p.steps[0].companion[0].offsetSeconds,0);
});
test('no MIDI identity can prove simultaneous or overlapping same-pitch voices',()=>{
 const s=score(),r=range(s);
 const unison={...s,events:[...s.events,
  makeNote('ambiguous',1,'5',1,1,60)]};
 assert.match(planPolyphonicRehearsal(unison,r,'both').reason,
  /Перекрывающиеся одинаковые высоты/);
 const sameOnset={...s,events:[...s.events,
  makeNote('same-time',2,'5',0,2,57)]};
 assert.match(planPolyphonicRehearsal(sameOnset,r,'right').reason,
  /Перекрывающиеся одинаковые высоты/);
 const repeat={...s,events:[
  ...s.events.filter(x=>x.id!=='rh-next'),
  makeNote('rh-repeat',1,'1',2,1,60)
 ]};
 const p=planPolyphonicRehearsal(repeat,r,'right');
 assert.equal(p.reason,null,'new same-pitch attack after the previous duration is valid');
});
test('untimed evaluation never claims absolute end-of-note accuracy',()=>{
 const s=score(),p=planPolyphonicRehearsal(s,range(s),'right');
 let state=startPolyphonicTrial(p);
 for(const midi of [60,64,67,62])state=recordPolyphonicKey(state,p,on(midi));
 assert.equal(state.correct,3);
 assert.equal(state.phase,'complete');
 assert.equal(Object.hasOwn(state,'durationAccuracy'),false);
});
