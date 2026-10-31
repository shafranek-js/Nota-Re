import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModuleVCoordinationFixture, MODULE_V_COORDINATION_COUNT } from
  '../src/core/training/moduleVCoordination.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import { initialTimedPractice, reduceTimedPractice, ticksToMs } from
  '../src/core/training/tempoTwoHand.ts';
import { assessPolyphonicPractice } from '../src/core/training/polyphonicAssessment.ts';
import { loadV4, recordV4, validateV4 } from '../src/core/storage/moduleVCoordinationStorage.ts';
import { MODULE_V_STAGES, MODULE_V_TWO_HANDS_ID } from '../src/data/moduleVCurriculum.ts';

test('V4 score: 24 deterministic 2-bar independent-staff 3/4 and 4/4 fixtures', () => {
  assert.equal(MODULE_V_COORDINATION_COUNT, 24);
  const unique = new Set();
  for (let i = 0; i < 24; i++) {
    const fixture = createModuleVCoordinationFixture(i);
    assert.deepEqual(fixture, createModuleVCoordinationFixture(i));
    unique.add(fixture.score.fifths + ':' + fixture.pattern + ':' +
      ((i * 5 + 7) % 6 < 3 ? 'major' : 'minor'));
    assert.equal(fixture.id, 'v4-' + String(i + 1).padStart(2,'0'));
    assert.ok(fixture.score.notes.some(n => n.staff === 1));
    assert.ok(fixture.score.notes.some(n => n.staff === 2));
    assert.equal(fixture.score.beats, fixture.pattern === 'held-harmony' ? 3 : 4);
    assert.equal(fixture.steps[0].onsetTicks, 0);
    assert.ok(fixture.steps.every((s,k) => k === 0 || s.onsetTicks > fixture.steps[k-1].onsetTicks));
    assert.ok(fixture.steps.some(s => s.expectedMidi.length > 1));
    assert.ok(fixture.score.notes.some(n => n.staff === 1 && n.durationTicks === (fixture.pattern === 'staggered' ? 2 : fixture.pattern === 'held-harmony' ? 12 : 4)));
    assert.ok(fixture.score.notes.some(n => n.staff === 2 && n.onsetTicks > 0));
    assert.ok(fixture.score.notes.every(n => n.onsetTicks + n.durationTicks <= 2 * fixture.score.beats * 4));
    const xml = toMusicXml(fixture.score);
    assert.equal((xml.match(/<measure number="/g) ?? []).length, 2);
    assert.match(xml, new RegExp('<time><beats>' + fixture.score.beats + '<\\/beats><beat-type>4<\\/beat-type><\\/time>'));
    assert.ok((xml.match(/<backup>/g) ?? []).length === 2, 'two separate, real staves');
    assert.doesNotMatch(xml, /held-harmony|delayed-entry|staggered/i);
  }
  assert.equal(unique.size, 24);
  assert.throws(() => createModuleVCoordinationFixture(-1), /Unknown/);
  assert.throws(() => createModuleVCoordinationFixture(24), /Unknown/);
});

test('real timebase: physical note-on/offs can complete two independent hands cleanly', () => {
  for (let i = 0; i < 24; i++) {
    const fixture = createModuleVCoordinationFixture(i);
    const plan = { startMs: 1000, bpm: 60, windowMs: 160, overlapMs: 140, holdGraceMs: 120 };
    let state = initialTimedPractice();
    const events = [];
    for (const note of fixture.score.notes) {
      const channel = note.staff === 1 ? 0 : 1;
      const start = plan.startMs + ticksToMs(note.onsetTicks, plan.bpm);
      const duration = ticksToMs(note.durationTicks, plan.bpm);
      events.push({type:'note-on',note:note.midi,channel,receivedAtMs:start+12});
      events.push({type:'note-off',note:note.midi,channel,
        receivedAtMs:start + duration * (note.articulation === 'staccato' ? 0.45 : 1)});
    }
    events.sort((a,b) => a.receivedAtMs - b.receivedAtMs ||
      (a.type === 'note-off' ? -1 : 1));
    for (const event of events) state = reduceTimedPractice(state, fixture.score, fixture.steps, plan, event);
    const end = Math.max(...fixture.score.notes.map(n => n.onsetTicks + n.durationTicks));
    state = reduceTimedPractice(state, fixture.score, fixture.steps, plan,
      {type:'tick',receivedAtMs:plan.startMs + ticksToMs(end,plan.bpm) + plan.windowMs + 1});
    const summary = assessPolyphonicPractice(fixture.score, fixture.steps, state);
    assert.equal(summary.right.matched, summary.right.expected, 'RH all onsets '+i);
    assert.equal(summary.left.matched, summary.left.expected, 'LH all onsets '+i);
    assert.equal(summary.matchedOnsets, summary.totalOnsets, 'joint onsets '+i);
    assert.equal(summary.errors.misses, 0);
    assert.equal(summary.errors.earlyReleases,0,'never early '+i);
    assert.equal(summary.errors.overheldNotes,0,'never overheld '+i);
    assert.equal(summary.clean, true,'complete clean physical performance '+i);
  }
});

test('held RH note cannot be released early during an independent LH line', () => {
  const f = Array.from({length:24}, (_,i)=>createModuleVCoordinationFixture(i))
    .find(f=>f.pattern==='held-harmony');
  const p={startMs:1000,bpm:60,windowMs:160,overlapMs:140,holdGraceMs:120};
  let state=initialTimedPractice();
  for(const note of f.score.notes.filter(n=>n.onsetTicks===0)) {
    state=reduceTimedPractice(state,f.score,f.steps,p,
      {type:'note-on',note:note.midi,channel:note.staff-1,receivedAtMs:1010});
  }
  assert.equal(state.hits,1,'both staves at one onset are required');
  const right=f.score.notes.find(n=>n.staff===1);
  state=reduceTimedPractice(state,f.score,f.steps,p,
    {type:'note-off',note:right.midi,channel:0,receivedAtMs:1250});
  assert.equal(state.earlyReleases,1);
  assert.equal(assessPolyphonicPractice(f.score,f.steps,state).clean,false);
  const disconnected=reduceTimedPractice(state,f.score,f.steps,p,{type:'panic'});
  assert.equal(disconnected.interruptions,1);
});

test('V4 journal is independent, bounded and fails closed on corrupted attempts', () => {
  assert.equal(MODULE_V_TWO_HANDS_ID,'module-v/v1/two-hands');
  assert.equal(MODULE_V_STAGES.filter(s=>s.available).length,5);
  assert.deepEqual(validateV4(null),{schemaVersion:4,attempts:[]});
  const legacy = new Map([
    ['notare_module_v_practice_v1','a'],
    ['notare_module_v_inversions_v2','b'],
    ['notare_module_v_left_textures_v3','c'],
    ['notare_course_completed_v3','d']
  ]);
  const old=globalThis.localStorage;
  globalThis.localStorage={getItem:key=>legacy.get(key)??null,
    setItem:(key,value)=>legacy.set(key,value)};
  try {
    const attempt={fixtureId:'v4-01',bpm:60,matchedOnsets:3,totalOnsets:6,
      rightMatched:2,rightExpected:3,leftMatched:3,leftExpected:5,
      misses:3,wrongPitches:0,offBeatNotes:1,earlyReleases:0,
      overheldNotes:0,interruptions:0,clean:false};
    assert.equal(recordV4({...attempt,matchedOnsets:7}).attempts.length,0);
    for(let i=0;i<70;i++)recordV4(attempt);
    assert.equal(loadV4().attempts.length,60);
    assert.equal(legacy.get('notare_module_v_practice_v1'),'a');
    assert.equal(legacy.get('notare_module_v_inversions_v2'),'b');
    assert.equal(legacy.get('notare_module_v_left_textures_v3'),'c');
    assert.equal(legacy.get('notare_course_completed_v3'),'d');
    legacy.set('notare_module_v_coordination_v4','{invalid');
    assert.equal(loadV4().attempts.length,0);
  } finally { if(old===undefined) delete globalThis.localStorage;
    else globalThis.localStorage=old; }
});
