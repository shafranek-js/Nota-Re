import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccompanimentStudy } from '../src/core/training/accompanimentStudy.ts';
import { planGeneratedHandRehearsal, startPolyphonicTrial, recordPolyphonicKey
} from '../src/core/training/repertoirePolyphonicTrial.ts';

test('generated Module V Alberti study preserves actual bass and RH chord onsets', () => {
  const study = createAccompanimentStudy('C', 'major', 0, 'alberti', 'both');
  const prior = JSON.stringify(study.score);
  const playLeft = planGeneratedHandRehearsal(study.score, 120, 'left');
  assert.equal(playLeft.reason, null);
  assert.equal(playLeft.steps.length, 16, 'eight bass eighth-notes per bar');
  assert.deepEqual(playLeft.steps[0].targets.map(n => n.midi), [48]);
  assert.equal(playLeft.steps[0].companion.length, 3, 'complete RH triad supplied as audio');
  assert.ok(playLeft.steps[0].companion.every(n => n.durationSeconds > 1));
  const playRight = planGeneratedHandRehearsal(study.score, 120, 'right');
  assert.equal(playRight.reason, null);
  assert.equal(playRight.steps.length, 2, 'RH held triad has one attack in each bar');
  assert.equal(playRight.steps[0].targets.length, 3);
  assert.equal(playRight.steps[0].companion.length, 8, 'all 8 Alberti LH attacks covered between RH groups');
  assert.equal(playRight.steps[0].companion[1].offsetSeconds, 0.25);
  assert.equal(JSON.stringify(study.score), prior);
});

test('Module V waltz 3/4 timing follows real time signature without fake 4/4 bars', () => {
  const study = createAccompanimentStudy('C', 'major', 0, 'waltz', 'both');
  const left = planGeneratedHandRehearsal(study.score, 120, 'left');
  const right = planGeneratedHandRehearsal(study.score, 120, 'right');
  assert.equal(left.reason, null);
  assert.equal(left.steps.length, 6, 'bass, chord, chord per bar');
  assert.equal(right.steps.length, 2, 'one RH triad per bar');
  assert.equal(right.steps[0].companion.length, 5);
  assert.equal(right.steps[1].onset.numerator, 12, 'second 3/4 bar begins at 12 sixteenth ticks');
  assert.equal(right.steps[0].companion[1].offsetSeconds, 0.5);
});

test('generated hand targets reject duplicate attack evidence and never count output as input', () => {
  const study = createAccompanimentStudy('C', 'major', 0, 'arpeggio', 'both');
  const plan = planGeneratedHandRehearsal(study.score, 90, 'right');
  let state = startPolyphonicTrial(plan);
  for (const n of plan.steps[0].targets) state = recordPolyphonicKey(state, plan,
    { type: 'note-on', note: n.midi });
  assert.equal(state.index, 1);
  assert.equal(state.correct, 1);
  assert.equal(state.wrong, 0);
  assert.equal(plan.steps[0].companion.length, 8);
  assert.equal(state.correct, 1, 'companion outputs never enter physical MIDI reducer');
});

test('unsupported Module V inputs fail closed rather than creating pretend hand practice', () => {
  const leftOnly = createAccompanimentStudy('C', 'major', 0, 'alberti', 'left');
  assert.ok(planGeneratedHandRehearsal(leftOnly.score, 120, 'left').reason);
  const study = createAccompanimentStudy('C', 'major', 0, 'waltz', 'both');
  assert.ok(planGeneratedHandRehearsal(study.score, 0, 'left').reason);
  assert.ok(planGeneratedHandRehearsal({
    ...study.score, notes: [...study.score.notes, { ...study.score.notes[0], staff: 2 }]
  }, 120, 'both').reason);
});
