import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModuleVCadenceFixture, MODULE_V_CADENCE_COUNT } from
  '../src/core/training/moduleVCadences.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import { initialTimedPractice, reduceTimedPractice, ticksToMs } from
  '../src/core/training/tempoTwoHand.ts';
import { assessPolyphonicPractice } from '../src/core/training/polyphonicAssessment.ts';
import { loadV5, recordV5, validateV5 } from
  '../src/core/storage/moduleVCadenceStorage.ts';

test('V5: 36 real V–i scores with distinct inversions, minor keys and exact raised VII', () => {
  assert.equal(MODULE_V_CADENCE_COUNT, 36);
  const seen = new Set();
  const expected = { C: ['A','G#',0], G: ['E','D#',1],
    F: ['D','C#',-1], D: ['B','A#',2] };
  for(let i=0;i<MODULE_V_CADENCE_COUNT;i++) {
    const fixture=createModuleVCadenceFixture(i);
    assert.deepEqual(fixture,createModuleVCadenceFixture(i));
    const [tonic,leading,fifths]=expected[fixture.key];
    assert.equal(fixture.tonic,tonic);
    assert.equal(fixture.leadingTone,leading);
    assert.equal(fixture.score.mode,'minor');
    assert.equal(fixture.score.fifths,fifths,'do not alter key signature to raise VII');
    seen.add([fixture.key,fixture.texture,fixture.inversion].join(':'));
    const bar=fixture.score.beats*4;
    const first=fixture.score.notes.filter(n=>n.onsetTicks<bar);
    const second=fixture.score.notes.filter(n=>n.onsetTicks>=bar);
    assert.ok(first.some(n=>n.staff===1 && n.spelling?.step===leading[0] &&
      n.spelling.alter===1));
    assert.ok(second.every(n=>n.spelling?.step!==leading[0] || n.spelling.alter!==1));
    assert.deepEqual(new Set(fixture.score.notes.map(n=>n.staff)),new Set([1,2]));
    assert.ok(fixture.steps.some(s=>s.expectedMidi.length>1));
    assert.equal(fixture.steps[0].onsetTicks,0);
    assert.ok(fixture.score.notes.every(n=>n.onsetTicks+n.durationTicks<=2*bar));
    assert.equal((toMusicXml(fixture.score).match(/<backup>/g)??[]).length,2);
    assert.equal((toMusicXml(fixture.score).match(/<measure number="/g)??[]).length,2);
    assert.doesNotMatch(toMusicXml(fixture.score),/G#|D#|C#|A#|alberti|arpeggio|waltz/i,
      'the visible XML title must not leak the generator preset');
  }
  assert.equal(seen.size,36);
  assert.throws(()=>createModuleVCadenceFixture(-1),/Unknown/);
  assert.throws(()=>createModuleVCadenceFixture(36),/Unknown/);
});

test('V5: each cadence admits fully clean independent-note-on/off evidence', () => {
  for(let i=0;i<36;i++) {
    const f=createModuleVCadenceFixture(i);
    const plan={startMs:1000,bpm:60,windowMs:160,overlapMs:140,holdGraceMs:120};
    let state=initialTimedPractice();
    const events=[];
    for(const n of f.score.notes) {
      const ch=n.staff-1;
      const start=plan.startMs+ticksToMs(n.onsetTicks,plan.bpm);
      const duration=ticksToMs(n.durationTicks,plan.bpm);
      events.push({type:'note-on',note:n.midi,channel:ch,receivedAtMs:start+12});
      events.push({type:'note-off',note:n.midi,channel:ch,
        receivedAtMs:start+duration*(n.articulation==='staccato'?0.45:1)});
    }
    events.sort((a,b)=>a.receivedAtMs-b.receivedAtMs ||
      (a.type==='note-off'?-1:1));
    for(const event of events)state=reduceTimedPractice(state,f.score,f.steps,plan,event);
    const end=2*f.score.beats*4;
    state=reduceTimedPractice(state,f.score,f.steps,plan,
      {type:'tick',receivedAtMs:plan.startMs+ticksToMs(end,plan.bpm)+200});
    const summary=assessPolyphonicPractice(f.score,f.steps,state);
    assert.equal(summary.clean,true,'V5 cadence '+i+' should be physically playable');
    assert.equal(summary.matchedOnsets,summary.totalOnsets);
  }
});

test('V5: isolated journal is bounded, rejects damaged records and preserves all prior evidence',()=>{
  assert.deepEqual(validateV5({schemaVersion:1,attempts:[]}),{schemaVersion:5,attempts:[]});
  const old=globalThis.localStorage;
  const db=new Map([
    ['notare_module_v_practice_v1','v1'],
    ['notare_module_v_inversions_v2','v2'],
    ['notare_module_v_left_textures_v3','v3'],
    ['notare_module_v_coordination_v4','v4'],
    ['notare_course_completed_v3','course']
  ]);
  globalThis.localStorage={getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,v)};
  try{
    const attempt={fixtureId:'v5-01',bpm:60,matchedOnsets:2,totalOnsets:5,
      rightMatched:2,rightExpected:3,leftMatched:1,leftExpected:4,
      misses:3,wrongPitches:0,offBeatNotes:0,earlyReleases:0,
      overheldNotes:0,interruptions:0,clean:false};
    assert.equal(recordV5({...attempt,matchedOnsets:99}).attempts.length,0);
    for(let i=0;i<70;i++)recordV5(attempt);
    assert.equal(loadV5().attempts.length,60);
    for(const [k,v] of [...db.entries()].filter(([k])=>k!=='notare_module_v_cadences_v5')) {
      assert.equal(db.get(k),v,'V5 may not touch '+k);
    }
    db.set('notare_module_v_cadences_v5','{invalid');
    assert.equal(loadV5().attempts.length,0);
  } finally {
    if(old===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=old;
  }
});
