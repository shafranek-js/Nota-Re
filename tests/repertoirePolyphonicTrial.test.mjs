import test from 'node:test';
import assert from 'node:assert/strict';
import { quarter } from '../src/core/notation/scoreDocument.ts';
import { planPolyphonicRehearsal, initialPolyphonicTrial, startPolyphonicTrial,
  recordPolyphonicKey } from '../src/core/training/repertoirePolyphonicTrial.ts';

const q = quarter;
const pitch = (midi) => {
  const steps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  return { step: steps[midi % 12], alter: alters[midi % 12],
    octave: Math.floor(midi / 12) - 1, midi };
};
const note = (id, staff, onset, midi, duration = 1) => ({
  id, partId: 'P1', measureId: 'm1', staff, voice: String(staff),
  kind: 'note', onset: q(onset), duration: q(duration), pitch: pitch(midi)
});
const bar = { id: 'm1', printedNumber: '1', start: q(0), duration: q(4),
  meter: { beats: 4, beatType: 4 } };
const range = { fromMeasureId: 'm1', throughMeasureId: 'm1',
  measureIds: ['m1'], eventIds: [], start: q(0), end: q(4) };
const fixture = (events, staves = 2) => ({
  schemaVersion: 1, id: 'source', title: 'Piano', source: 'imported',
  parts: [{ id: 'P1', name: 'Piano', staves }],
  measures: [bar], events, tempos: [{ onset: q(0), quarterBpm: 120 }]
});
const grand = () => fixture([
  note('c4', 1, 0, 60), note('e4', 1, 0, 64), note('g4', 1, 0, 67),
  note('c3', 2, 0, 48), note('d3', 2, 1, 50),
  note('d4', 1, 2, 62)
]);

test('groups real score simultaneity, never flattens a chord', () => {
  const original = grand();
  const before = JSON.stringify(original);
  const plan = planPolyphonicRehearsal(original, range, 'both');
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.steps.map(step => step.targets.map(n => n.midi)),
    [[60, 64, 67, 48], [50], [62]]);
  assert.ok(plan.steps.every(step => step.companion.length === 0));
  assert.equal(JSON.stringify(original), before);
});

test('right-hand study schedules left-hand events including intervening bass attacks', () => {
  const plan = planPolyphonicRehearsal(grand(), range, 'right');
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.steps.map(step => step.targets.map(n => n.midi)),
    [[60, 64, 67], [62]]);
  assert.equal(plan.steps[0].companion.length, 2);
  assert.equal(plan.steps[0].companion[0].offsetSeconds, 0);
  assert.equal(plan.steps[0].companion[1].offsetSeconds, 0.5);
  assert.ok(plan.steps[0].companion.every(note => note.durationSeconds > 0));
  assert.equal(plan.steps[1].companion.length, 0);
});

test('left-hand study keeps both bass attacks as targets and moves RH note into companion timeline', () => {
  const plan = planPolyphonicRehearsal(grand(), range, 'left');
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.steps.map(step => step.targets.map(n => n.midi)), [[48], [50]]);
  assert.equal(plan.steps[0].companion.length, 3);
  assert.equal(plan.steps[1].companion.length, 1);
  assert.equal(plan.steps[1].companion[0].offsetSeconds, 0.5);
});

test('chord requires all held physical note-ons; release before completion clears the pending key', () => {
  const plan = planPolyphonicRehearsal(grand(), range, 'right');
  let state = startPolyphonicTrial(plan);
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 60 });
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 64 });
  state = recordPolyphonicKey(state, plan, { type: 'note-off', note: 60 });
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 67 });
  assert.equal(state.index, 0, 'released C4 cannot count toward the chord');
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 60 });
  assert.deepEqual([state.index, state.correct, state.completedStepIndex], [1, 1, 0]);
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 62 });
  assert.deepEqual([state.phase, state.correct, state.completedStepIndex], ['complete', 2, 1]);
  assert.equal(recordPolyphonicKey(state, plan, { type: 'note-on', note: 62 }), state);
});

test('extra notes are wrong and duplicate held note-on is not a new attack', () => {
  const plan = planPolyphonicRehearsal(fixture([note('a', 1, 0, 60),
    note('b', 1, 1, 60)], 1), range, 'both');
  let state = startPolyphonicTrial(plan);
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 72 });
  assert.equal(state.wrong, 1);
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 60 });
  assert.equal(state.index, 1);
  assert.equal(recordPolyphonicKey(state, plan, { type: 'note-on', note: 60 }), state);
  state = recordPolyphonicKey(state, plan, { type: 'note-off', note: 60 });
  state = recordPolyphonicKey(state, plan, { type: 'note-on', note: 60 });
  assert.equal(state.phase, 'complete');
  assert.equal(initialPolyphonicTrial().correct, 0);
});

test('unsupported score cases are rejected with explanatory reasons', () => {
  const examples = [
    { score: fixture([note('x', 1, 0, 60, 1), note('y', 2, 0, 60, 1)]), mode: 'both' },
    { score: fixture([note('x', 1, 0, 60, 1)], 1), mode: 'left' },
    { score: fixture([note('x', 1, 0, 60, 1), note('y', 2, 0, 48, 1)], 2), mode: 'right',
      override: events => events.map(e => e.id === 'x' ? { ...e, tieToId: 'y' } : e) },
    { score: fixture([note('early', 2, 0, 48), note('later', 1, 1, 60)]), mode: 'right' },
    { score: fixture([note('x', 1, 0, 60), { ...note('v2', 1, 1, 64), voice: '3' }]), mode: 'both' },
  ];
  for (const example of examples) {
    const score = example.override ?
      { ...example.score, events: example.override(example.score.events) } : example.score;
    const plan = planPolyphonicRehearsal(score, range, example.mode);
    assert.ok(plan.reason, 'reject without fake completion');
    assert.equal(startPolyphonicTrial(plan).phase, 'idle');
  }
});
