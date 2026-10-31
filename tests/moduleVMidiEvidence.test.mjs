import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTwoHandPractice } from '../src/core/training/twoHandPractice.ts';
import { createTwoHandSteps } from '../src/core/training/lessonTwoHandScore.ts';
import { createScoreFromTimedHands } from '../src/core/notation/musicXml.ts';
import { initialTimedPractice, reduceTimedPractice, ticksToMs } from
  '../src/core/training/tempoTwoHand.ts';
import { assessPolyphonicPractice } from '../src/core/training/polyphonicAssessment.ts';

const { score, steps } = createTwoHandPractice('C', 8, 'steady');
const plan = { startMs: 1000, bpm: 60, windowMs: 160,
  overlapMs: 140, holdGraceMs: 1200 };

function physicalReplay({ omitLastRelease = false, timestamplessLastRelease = false } = {}) {
  const endTicks = Math.max(...score.notes.map(n => n.onsetTicks + n.durationTicks));
  const last = [...score.notes].reverse().find(n => n.onsetTicks + n.durationTicks === endTicks);
  const scheduled = [];
  for (const note of score.notes) {
    const channel = note.staff === 1 ? 0 : 1;
    const start = plan.startMs + ticksToMs(note.onsetTicks, plan.bpm);
    const end = plan.startMs + ticksToMs(note.onsetTicks + note.durationTicks, plan.bpm);
    scheduled.push({ at: start + 12, event: {
      type: 'note-on', note: note.midi, channel, receivedAtMs: start + 12
    } });
    if (note === last && omitLastRelease) continue;
    scheduled.push({ at: end, event: {
      type: 'note-off', note: note.midi, channel,
      ...(note === last && timestamplessLastRelease ? {} : { receivedAtMs: end })
    } });
  }
  scheduled.sort((a,b) => a.at - b.at ||
    (a.event.type === 'note-off' ? -1 : 1));
  let state = initialTimedPractice();
  for (const { event } of scheduled) {
    state = reduceTimedPractice(state, score, steps, plan, event);
  }
  state = reduceTimedPractice(state, score, steps, plan, {
    type: 'tick', receivedAtMs: plan.startMs + ticksToMs(endTicks, plan.bpm) + 161
  });
  return { state, assessment: assessPolyphonicPractice(score, steps, state) };
}

test('a complete two-staff physical performance includes verified NoteOff for every note', () => {
  const {state,assessment} = physicalReplay();
  assert.equal(state.hits,steps.length);
  assert.equal(assessment.releaseEvidence.expected,score.notes.length);
  assert.equal(assessment.releaseEvidence.matched,score.notes.length);
  assert.equal(assessment.releaseEvidence.missing,0);
  assert.equal(assessment.clean,true);
});

test('all correct NoteOns with an unreleased final key MUST NOT be clean', () => {
  const {state,assessment} = physicalReplay({ omitLastRelease: true });
  assert.equal(state.hits,steps.length,'every required musical attack was hit');
  assert.equal(state.overheldNotes,0,
    'the configured hold grace deliberately exceeds the end-of-phrase window');
  assert.equal(assessment.complete,true,'onset grid really finished');
  assert.equal(assessment.right.matched,assessment.right.expected);
  assert.equal(assessment.left.matched,assessment.left.expected);
  assert.equal(assessment.releaseEvidence.missing,1,'a physical NoteOff never occurred');
  assert.equal(assessment.clean,false);
  assert.equal(assessment.readyForCourseTrial,false);
});

test('undated MIDI NoteOff is not verifiable release evidence', () => {
  const {assessment} = physicalReplay({ timestamplessLastRelease: true });
  assert.equal(assessment.releaseEvidence.missing,1);
  assert.equal(assessment.clean,false);
  assert.ok(assessment.recommendations.some(line=>line.includes('NoteOff')));
});

test('a late second chord member cannot make a joint physical onset', () => {
  let state=reduceTimedPractice(initialTimedPractice(),score,steps,plan,{
    type:'note-on',note:48,channel:1,receivedAtMs:1000
  });
  state=reduceTimedPractice(state,score,steps,plan,{
    type:'note-on',note:60,channel:0,receivedAtMs:1150
  });
  assert.equal(state.hits,0,'both NoteOns must overlap within 140 ms');
  assert.equal(state.acceptedAttacks.length,2,'individual correct pitches can be reported');
  assert.equal(state.feedback,'partial');
});

test('a held bass cannot replace a new attack, and a wrong inversion cannot pass', () => {
  let state=initialTimedPractice();
  state=reduceTimedPractice(state,score,steps,plan,{
    type:'note-on',note:48,channel:0,receivedAtMs:1005
  });
  state=reduceTimedPractice(state,score,steps,plan,{
    type:'note-on',note:48,channel:0,receivedAtMs:1008
  });
  assert.equal(state.acceptedAttacks.length,1,'repeated hardware NoteOn is not a new attack');
  state=reduceTimedPractice(state,score,steps,plan,{
    type:'note-on',note:61,channel:0,receivedAtMs:1020
  });
  assert.equal(state.wrongPitches,1,'C# is not a substitute for written C');
  assert.equal(state.hits,0);
  state=reduceTimedPractice(state,score,steps,plan,{type:'panic'});
  assert.equal(state.interruptions,1,'MIDI disconnect makes the attempt unverified');
});

test('same physical MIDI pitch on both staves at one onset is explicitly non-assessable',()=>{
  const unison=createScoreFromTimedHands(
    [{midi:60,onsetTicks:0,durationTicks:4}],
    [{midi:60,onsetTicks:0,durationTicks:4}],
    'C','Two hands same MIDI key');
  assert.throws(()=>createTwoHandSteps(unison),/Ambiguous simultaneous pitch/);
});
