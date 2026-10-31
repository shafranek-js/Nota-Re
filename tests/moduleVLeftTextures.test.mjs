import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import { createModuleVLeftFixture, readLeftTexture, evaluateModuleVLeftFixture,
  MODULE_V_LH_COUNT } from '../src/core/training/moduleVLeftTextures.ts';
import { initialChordPractice, reduceChordPractice } from '../src/core/training/twoHandPractice.ts';
import { validateV3, loadV3, recordV3Attempt, recordV3MidiRehearsal } from '../src/core/storage/moduleVLeftStorage.ts';
import { MODULE_V_STAGES, MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID,
  MODULE_V_LEFT_TEXTURES_ID } from '../src/data/moduleVCurriculum.ts';

test('24 real left-hand score fixtures span 4 keys × 2 modes × 3 textures', () => {
  assert.equal(MODULE_V_LH_COUNT, 24);
  const combinations = new Set();
  for (let i = 0; i < MODULE_V_LH_COUNT; i++) {
    const fixture = createModuleVLeftFixture(i);
    const signature = fixture.score.fifths;
    const score = fixture.score;
    const actual = readLeftTexture(score);
    const quality = (i * 5 + 7) % 6 < 3 ? 'major' : 'minor';
    assert.ok(actual);
    combinations.add(signature + ':' + quality + ':' + actual);
    assert.equal(score.notes.some(note => note.staff === 1), false);
    assert.equal(score.notes.at(-1).onsetTicks < (score.beats * 8), true);
    assert.equal(fixture.steps.length, actual === 'waltz' ? 6 : 16);
    assert.equal(score.beats, actual === 'waltz' ? 3 : 4);
    assert.equal(fixture.id, 'v3-' + String(i + 1).padStart(2, '0'));
    assert.equal(evaluateModuleVLeftFixture(fixture, actual).correct, true);
    for (const wrong of ['alberti', 'waltz', 'arpeggio'].filter(t => t !== actual)) {
      assert.equal(evaluateModuleVLeftFixture(fixture, wrong).correct, false);
    }
    const xml = toMusicXml(score, { hideInactiveStaffRests: true, hideGeneratedRests: true });
    assert.equal((xml.match(/<measure number="/g) ?? []).length, 2);
    assert.match(xml, new RegExp('<time><beats>' + score.beats + '<\\/beats><beat-type>4<\\/beat-type><\\/time>'));
    assert.doesNotMatch(xml, /alberti|waltz|arpeggio|вальсовый|ломаное арпеджио/i,
      'OSMD must never receive answer-bearing titles');
    assert.equal((xml.match(/<chord\/>/g) ?? []).length, actual === 'waltz' ? 4 : 0);
    const shifted = createModuleVLeftFixture(i, 12);
    assert.equal(readLeftTexture(shifted.score), actual);
    assert.equal(shifted.score.beats, score.beats);
    assert.deepEqual(shifted.score.notes.map(n => [n.midi, n.onsetTicks, n.durationTicks]),
      score.notes.map(n => [n.midi + 12, n.onsetTicks, n.durationTicks]));
    assert.ok(shifted.score.notes.every(n => n.midi >= 48 && n.midi <= 72));
    assert.deepEqual(shifted.steps.map(s => s.onsetTicks), fixture.steps.map(s => s.onsetTicks));
  }
  assert.equal(combinations.size, 24);
  assert.throws(() => createModuleVLeftFixture(-1), /Invalid/);
  assert.throws(() => createModuleVLeftFixture(24), /Invalid/);
  assert.throws(() => createModuleVLeftFixture(0, 24), /Invalid/);
});

test('classifier fails closed on a wrong meter, chord placement, mixed texture or other staff', () => {
  const alberti = createModuleVLeftFixture(1).score; // F-major Alberti
  assert.equal(readLeftTexture(alberti), 'alberti');
  assert.equal(readLeftTexture({ ...alberti, beats: 3 }), null);
  assert.equal(readLeftTexture({ ...alberti, notes: [{ ...alberti.notes[0], staff: 1 }, ...alberti.notes.slice(1)] }), null);
  assert.equal(readLeftTexture({ ...alberti, notes: alberti.notes.slice(0, -1) }), null);
  assert.equal(readLeftTexture({
    ...alberti, notes: alberti.notes.map(note => note.onsetTicks === 2
      ? { ...note, midi: note.midi + 1 } : note)
  }), null);
  const waltz = Array.from({ length: 24 }, (_, i) => createModuleVLeftFixture(i))
    .find(f => readLeftTexture(f.score) === 'waltz').score;
  assert.equal(readLeftTexture(waltz), 'waltz');
  assert.equal(readLeftTexture({ ...waltz, notes: waltz.notes.map(n => n.onsetTicks === 4
    ? { ...n, onsetTicks: 5 } : n) }), null);
  assert.throws(() => evaluateModuleVLeftFixture(createModuleVLeftFixture(0), 'march'), /Invalid/);
});

test('strict physical MIDI note-on/off rehearsal uses real score event order, no extra keys', () => {
  const fixture = createModuleVLeftFixture(1, 12);
  let state = initialChordPractice();
  const on = (note, ms) => ({ type: 'note-on', note, channel: 0, receivedAtMs: ms });
  const off = note => ({ type: 'note-off', note, channel: 0 });
  state = reduceChordPractice(state, fixture.steps, on(99, 1), 180, true);
  assert.equal(state.stepIndex, 0, 'wrong keys cannot pass a step');
  state = reduceChordPractice(state, fixture.steps, off(99), 180, true);
  let tick = 1000;
  for (const step of fixture.steps) {
    for (const pitch of step.expectedMidi) {
      state = reduceChordPractice(state, fixture.steps, on(pitch, tick), 180, true);
      tick += 20;
    }
    assert.equal(state.stepIndex, fixture.steps.indexOf(step) + 1);
    // In particular, repeat note-ons are disallowed until physical key-off.
    for (const pitch of step.expectedMidi) state = reduceChordPractice(state, fixture.steps, off(pitch), 180, true);
    tick += 200;
  }
  assert.equal(state.feedback, 'complete');
});

test('V3 journal is versioned, bounded, rejects invalid entries and never mutates V1/V2 or course keys', () => {
  assert.deepEqual(MODULE_V_STAGES.filter(s => s.available).map(s => s.id),
    [MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID, MODULE_V_LEFT_TEXTURES_ID]);
  assert.deepEqual(validateV3(null), { schemaVersion: 3, attempts: [], midiRehearsals: [] });
  assert.deepEqual(validateV3({ schemaVersion: 9, attempts: [], midiRehearsals: [] }),
    { schemaVersion: 3, attempts: [], midiRehearsals: [] });
  const previous = globalThis.localStorage;
  const data = new Map([
    ['notare_module_v_practice_v1', '{"schemaVersion":1,"completedFixtures":["C-major-5-3"]}'],
    ['notare_module_v_inversions_v2', '{"schemaVersion":2,"attempts":[]}'],
    ['notare_course_completed_v3', '[1,2]']
  ]);
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, val) => data.set(key, val) };
  try {
    const attempt = { fixtureId: 'v3-01', mode: 'independent',
      response: 'waltz', correct: false, usedHint: false };
    assert.equal(recordV3Attempt({ ...attempt, usedHint: true }).attempts.length, 0);
    assert.deepEqual(recordV3Attempt(attempt).attempts, [attempt]);
    assert.equal(recordV3MidiRehearsal('v3-01', 12).midiRehearsals[0], 'v3-01:12');
    recordV3MidiRehearsal('v3-01', 12);
    assert.equal(loadV3().midiRehearsals.length, 1);
    for (let i = 0; i < 110; i++) recordV3Attempt(attempt);
    assert.equal(loadV3().attempts.length, 100);
    assert.equal(data.get('notare_module_v_practice_v1'),
      '{"schemaVersion":1,"completedFixtures":["C-major-5-3"]}');
    assert.equal(data.get('notare_module_v_inversions_v2'), '{"schemaVersion":2,"attempts":[]}');
    assert.equal(data.get('notare_course_completed_v3'), '[1,2]');
    data.set('notare_module_v_left_textures_v3', '{broken');
    assert.equal(loadV3().attempts.length, 0);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
