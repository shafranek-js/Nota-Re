import test from 'node:test';
import assert from 'node:assert/strict';
import { quarter } from '../src/core/notation/scoreDocument.ts';
import { planRepertoirePitchTrial, initialPitchTrial, startPitchTrial,
  recordPitchTrialNote, stopPitchTrial } from '../src/core/training/repertoirePitchTrial.ts';

const q = quarter;
const pitch = (midi) => ({ step: 'C', alter: 0, octave: 4, midi });
const note = (id, measureId, onset, midi, other = {}) => ({
  id, partId: 'P1', measureId, staff: 1, voice: '1', kind: 'note',
  onset: q(onset), duration: q(1), pitch: pitch(midi), ...other
});
const measure = (id, n) => ({ id, printedNumber: String(n + 1),
  start: q(4 * n), duration: q(4), meter: { beats: 4, beatType: 4 } });
const score = (events, options = {}) => ({
  schemaVersion: 1, id: 'test', title: 'Test', source: 'imported',
  parts: [{ id: 'P1', name: 'Piano', staves: 1 }],
  measures: [measure('m1', 0), measure('m2', 1)], events, tempos: [], ...options
});
const range = (ids = ['m1', 'm2']) => ({
  fromMeasureId: ids[0], throughMeasureId: ids.at(-1), measureIds: ids,
  eventIds: [], start: q(0), end: q(8)
});
const sample = () => score([
  note('C4', 'm1', 0, 60),
  { id: 'rest', partId: 'P1', measureId: 'm1', staff: 1, voice: '1',
    kind: 'rest', onset: q(1), duration: q(3) },
  note('E4', 'm2', 4, 64)
]);

test('a verified single-line A-B range creates exact, source-identified MIDI targets', () => {
  const plan = planRepertoirePitchTrial(sample(), range());
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.steps, [
    { eventId: 'C4', measureId: 'm1', midi: 60 },
    { eventId: 'E4', measureId: 'm2', midi: 64 }
  ]);
  assert.deepEqual(planRepertoirePitchTrial(sample(), range(['m2'])).steps,
    [{ eventId: 'E4', measureId: 'm2', midi: 64 }]);
});

test('wrong notes do not advance; correct MIDI note-on advances exactly once to completion', () => {
  const plan = planRepertoirePitchTrial(sample(), range());
  let state = startPitchTrial(plan);
  state = recordPitchTrialNote(state, plan, 61);
  assert.deepEqual([state.index, state.correct, state.wrong, state.last],
    [0, 0, 1, 'wrong']);
  state = recordPitchTrialNote(state, plan, 60);
  assert.deepEqual([state.index, state.correct, state.wrong], [1, 1, 1]);
  state = recordPitchTrialNote(state, plan, 64);
  assert.deepEqual([state.phase, state.index, state.correct, state.wrong],
    ['complete', 2, 2, 1]);
  assert.equal(recordPitchTrialNote(state, plan, 64), state, 'no extra scoring after completion');
  assert.deepEqual(stopPitchTrial(), initialPitchTrial());
});

test('never infer attacks from a chord, overlapping voices, ties, unsupported parts, or empty ranges', () => {
  const base = sample();
  const cases = [
    score([...base.events, note('chord', 'm1', 0, 67)]),
    score([...base.events, note('secondVoice', 'm1', 0, 67, { voice: '2' })]),
    score([...base.events, note('overlap', 'm1', 0, 67, { onset: q(0), duration: q(2) })]),
    score(base.events, { parts: [{ id: 'P1', name: 'Piano', staves: 2 }] }),
    score(base.events, { parts: [{ id: 'P1', name: 'Piano', staves: 1 }, { id: 'P2', name: 'Strings', staves: 1 }] }),
    score(base.events.map(event => event.id === 'C4' ? { ...event, tieToId: 'E4' } : event)),
    score(base.events, { source: 'generated' })
  ];
  for (const unsupported of cases) {
    const plan = planRepertoirePitchTrial(unsupported, range());
    assert.ok(plan.reason, 'unsupported score must give explanation');
    assert.deepEqual(plan.steps, []);
    assert.deepEqual(startPitchTrial(plan), initialPitchTrial());
  }
  assert.match(planRepertoirePitchTrial(base, range(['m3'])).reason, /нет нот/);
  assert.equal(recordPitchTrialNote(initialPitchTrial(), planRepertoirePitchTrial(base, range()), 60).correct, 0);
  assert.equal(recordPitchTrialNote(startPitchTrial(planRepertoirePitchTrial(base, range())),
    planRepertoirePitchTrial(base, range()), 128).correct, 0);
});

test('cap note range size and preserve exact source score events', () => {
  const notes = Array.from({ length: 129 }, (_, i) => note('n' + i, 'm1', i, 60));
  const original = score(notes);
  const json = JSON.stringify(original);
  const result = planRepertoirePitchTrial(original, range(['m1']));
  assert.match(result.reason, /128/);
  assert.equal(JSON.stringify(original), json);
});
