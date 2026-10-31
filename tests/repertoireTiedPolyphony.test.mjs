import test from 'node:test';
import assert from 'node:assert/strict';
import { quarter, normalizeScoreDocument, selectScoreMeasures } from
  '../src/core/notation/scoreDocument.ts';
import { planPolyphonicRehearsal, startPolyphonicTrial, recordPolyphonicKey } from
  '../src/core/training/repertoirePolyphonicTrial.ts';

const q=quarter;
const pitch=(step,octave,alter=0)=>{
  const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step];
  return {step,alter,octave,midi:(octave+1)*12+base+alter};
};
const note=(id,bar,staff,onset,duration,p,props={})=>({
  id,partId:'P1',measureId:'m'+bar,staff,voice:String(staff),
  kind:'note',onset:q(onset),duration:q(duration),pitch:p,...props
});
const doc=()=>normalizeScoreDocument({
  schemaVersion:1,id:'ties',title:'Two hand tied melody',source:'imported',
  parts:[{id:'P1',name:'Piano',staves:2}],
  measures:[
    {id:'m1',printedNumber:'1',start:q(0),duration:q(4),meter:{beats:4,beatType:4}},
    {id:'m2',printedNumber:'2',start:q(4),duration:q(4),meter:{beats:4,beatType:4}},
    {id:'m3',printedNumber:'3',start:q(8),duration:q(4),meter:{beats:4,beatType:4}}
  ],
  events:[
    note('c-start',1,1,3,1,pitch('C',4),{tieToId:'c-middle'}),
    note('c-middle',2,1,4,2,pitch('C',4),{tieToId:'c-end'}),
    note('c-end',2,1,6,2,pitch('C',4)),
    note('bass-1',1,2,3,1,pitch('G',3)),
    note('bass-2',2,2,5,1,pitch('A',3)),
    note('bass-3',3,2,8,1,pitch('B',3)),
    note('melody-3',3,1,8,1,pitch('D',4))
  ],
  tempos:[{onset:q(0),quarterBpm:60}]
});
const range=(score,a,b)=>selectScoreMeasures(score,'m'+a,'m'+b);
const on=note=>({type:'note-on',note});
const off=note=>({type:'note-off',note});

test('tie across a barline is one attack, not three physical MIDI presses',()=>{
  const score=doc();
  const before=JSON.stringify(score);
  const plan=planPolyphonicRehearsal(score,range(score,1,3),'both');
  assert.equal(plan.reason,null);
  assert.deepEqual(plan.steps.map(x=>x.targets.map(n=>n.midi)),
    [[60,55],[57],[59,62]]);
  assert.deepEqual(plan.steps[1].requiredHeld,[60]);
  assert.equal(plan.steps[0].targets[0].eventId,'c-start');
  assert.equal(JSON.stringify(score),before,'source must stay immutable');
});

test('physical hold across the next LH entry is required, but no absolute duration is inferred',()=>{
  const score=doc();
  const plan=planPolyphonicRehearsal(score,range(score,1,3),'both');
  let state=startPolyphonicTrial(plan);
  state=recordPolyphonicKey(state,plan,on(60));
  state=recordPolyphonicKey(state,plan,on(55));
  assert.equal(state.index,1);
  state=recordPolyphonicKey(state,plan,off(55));
  state=recordPolyphonicKey(state,plan,on(57));
  assert.equal(state.index,2);
  assert.equal(state.correct,2);
  assert.equal(state.wrong,0);
  state=recordPolyphonicKey(state,plan,off(60));
  state=recordPolyphonicKey(state,plan,off(57));
  state=recordPolyphonicKey(state,plan,on(59));
  state=recordPolyphonicKey(state,plan,on(62));
  assert.equal(state.phase,'complete');
  assert.equal(state.correct,3);
});

test('early physical release before the next LH attack cannot be accepted as a tied sustain',()=>{
  const score=doc();
  const plan=planPolyphonicRehearsal(score,range(score,1,3),'both');
  let s=startPolyphonicTrial(plan);
  for(const n of [60,55])s=recordPolyphonicKey(s,plan,on(n));
  s=recordPolyphonicKey(s,plan,off(60));
  s=recordPolyphonicKey(s,plan,off(55));
  s=recordPolyphonicKey(s,plan,on(57));
  assert.equal(s.index,2,'advance as an incorrect self-paced step, not an awarded hit');
  assert.equal(s.correct,1);
  assert.equal(s.wrong,1);
  assert.equal(s.completedStepIndex,null,'incorrect hold never triggers accompaniment');
  assert.equal(s.last,'wrong');
});

test('A–B ranges cut through no tied source segment, including an incoming continuation',()=>{
  const score=doc();
  for(const [a,b] of [[1,1],[2,2],[2,3]]) {
    const plan=planPolyphonicRehearsal(score,range(score,a,b),'both');
    assert.match(plan.reason,/разрывает связующую лигу/);
    assert.equal(startPolyphonicTrial(plan).phase,'idle');
  }
  const suffix=planPolyphonicRehearsal(score,range(score,3,3),'both');
  assert.equal(suffix.reason,null,'independent bar after completed tie is eligible');
});

test('right-hand tie remains one attack; split companion transport rejects long RH tie crossing LH step',()=>{
  const score=doc(),r=range(score,1,3);
  const right=planPolyphonicRehearsal(score,r,'right');
  assert.equal(right.reason,null);
  assert.deepEqual(right.steps.map(x=>x.targets.map(n=>n.midi)),[[60],[62]]);
  const left=planPolyphonicRehearsal(score,r,'left');
  assert.match(left.reason,/непрерывный аудиотранспорт/);
  assert.equal(left.steps.length,0,'never start truncated audible tie');
});

test('broken and cyclic tied links fail closed even when normalization is bypassed',()=>{
  const score=doc(),r=range(score,1,3);
  const broken={...score,events:score.events.map(e=>e.id==='c-start'
    ? {...e,tieToId:'missing'}:e)};
  assert.match(planPolyphonicRehearsal(broken,r,'both').reason,/Некорректная цепочка/);
  const cycle={...score,events:score.events.map(e=>e.id==='c-end'
    ? {...e,tieToId:'c-start'}:e)};
  assert.match(planPolyphonicRehearsal(cycle,r,'both').reason,/циклическая/);
});
