import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScoreDocument, quarter, selectScoreMeasures } from '../src/core/notation/scoreDocument.ts';
import { buildScoreLoopAudio } from '../src/core/notation/scoreLoopAudio.ts';
import { LoopAudioClockQueue } from '../src/core/audio/audioTimeline.ts';

const q = quarter;
const pitch = (midi, step, octave) => ({ midi, step, octave, alter: 0 });
const note = (id, measureId, staff, voice, onset, duration, p, extra = {}) => ({
  id, measureId, partId: 'P1', staff, voice, kind: 'note',
  onset: q(onset), duration: q(duration), pitch: p, ...extra
});

function score() {
  return normalizeScoreDocument({
    schemaVersion: 1, id: 'ab-fixture', title: 'Tied passage', source: 'imported',
    parts: [{ id: 'P1', name: 'Piano', staves: 2 }],
    measures: [0, 1, 2].map(i => ({
      id: 'm' + (i + 1), printedNumber: String(i + 1),
      start: q(i * 4), duration: q(4), meter: { beats: 4, beatType: 4 }
    })),
    events: [
      note('c1', 'm1', 1, '1', 0, 4, pitch(60, 'C', 4), { tieToId: 'c2' }),
      note('c2', 'm2', 1, '1', 4, 2, pitch(60, 'C', 4)),
      note('d', 'm2', 1, '2', 4, 1, pitch(62, 'D', 4)),
      note('e', 'm2', 1, '1', 6, 2, pitch(64, 'E', 4), { articulation: 'staccato' }),
      note('f', 'm3', 1, '1', 8, 4, pitch(65, 'F', 4)),
      note('bass', 'm2', 2, '1', 4, 4, pitch(48, 'C', 3)),
      { id: 'rest', measureId: 'm3', partId: 'P1', staff: 2,
        voice: '1', kind: 'rest', onset: q(8), duration: q(4) }
    ],
    tempos: [{ onset: q(0), quarterBpm: 60 },
      { onset: q(4), quarterBpm: 120 },
      { onset: q(8), quarterBpm: 80 }]
  });
}

test('A–B integrates tempo changes, chords/independent hands, rests and ties', () => {
  const doc = score(), range = selectScoreMeasures(doc, 'm2', 'm3');
  const loop = buildScoreLoopAudio(doc, range);
  assert.equal(loop.periodSeconds, 5); // 4 quarter notes @120 + 4 @80
  assert.equal(loop.audibleNoteCount, 5);
  assert.deepEqual(loop.tones.map(n => n.offsetSeconds), [0, 0, 0, 1, 2]);
  const c = loop.tones.find(n => Math.abs(n.frequencyHz - 261.6255653) < 0.01);
  assert.ok(c, 'C4 from the prior bar sounds at A without a new tie attack');
  assert.ok(Math.abs(c.durationSeconds - 0.96) < 1e-8);
  const e = loop.tones.find(n => Math.abs(n.frequencyHz - 329.6276) < 0.01);
  assert.equal(e.staccato, true);
  assert.equal(e.durationSeconds, 0.12);
  const f = loop.tones.find(n => Math.abs(n.frequencyHz - 349.2282) < 0.01);
  assert.ok(Math.abs(f.durationSeconds - 2.88) < 1e-8);
  assert.ok(Object.isFrozen(loop));
  assert.ok(Object.isFrozen(loop.tones));
});

test('A–B clips tied notes at selected end, never adds attack on continuation', () => {
  const doc = score();
  const selected = selectScoreMeasures(doc, 'm1', 'm1');
  const loop = buildScoreLoopAudio(doc, selected);
  assert.equal(loop.periodSeconds, 4);
  assert.equal(loop.tones.length, 1);
  assert.equal(loop.tones[0].durationSeconds, 3.84);
});

test('A–B rejects stale IDs, absurd tempi and excessive 15-minute spans', () => {
  const doc = score();
  const range = selectScoreMeasures(doc, 'm1', 'm3');
  assert.throws(() => buildScoreLoopAudio(doc, range, 0), /Темп/);
  assert.throws(() => buildScoreLoopAudio(doc,
    { ...range, start: q(99) }), /Диапазон/);
  const slow = { ...doc, tempos: [{ onset: q(0), quarterBpm: 10 }] };
  assert.equal(buildScoreLoopAudio(slow, range).periodSeconds, 72);
});

test('audio loop holds exact cycle origins and cancels scheduled voices on stop', () => {
  let now = 0, cancelled = 0;
  const attacks = [];
  const queue = new LoopAudioClockQueue(() => now, (tone, time) => {
    attacks.push([tone.frequencyHz, time]);
    return () => { cancelled++; };
  });
  const tone = { offsetSeconds: 0, durationSeconds: 0.10, frequencyHz: 440, staccato: false };
  queue.start([tone], 0.5);
  assert.equal(queue.isPlaying, true);
  assert.deepEqual(attacks, [[440, 0.08]]);
  now = 0.56;
  queue.pump();
  assert.equal(attacks.length, 2);
  assert.ok(Math.abs(attacks[1][1] - 0.58) < 1e-9);
  now = 1.06;
  queue.pump();
  assert.equal(attacks.length, 3);
  assert.ok(Math.abs(attacks[2][1] - 1.08) < 1e-9);
  queue.stop();
  assert.equal(queue.isPlaying, false);
  assert.ok(cancelled >= 1);
});

test('audio loop skips stale cycles after background suspension; rejects out-of-range events', () => {
  let now = 0;
  const attacks = [];
  const queue = new LoopAudioClockQueue(() => now, (_tone, at) => {
    attacks.push(at); return () => {};
  });
  const tone = { offsetSeconds: 0, durationSeconds: 0.1, frequencyHz: 440, staccato: false };
  assert.throws(() => queue.start([{ ...tone, offsetSeconds: 0.48 }], 0.5), /outside A–B/);
  queue.start([tone], 0.5);
  now = 30;
  queue.pump();
  assert.equal(attacks.length, 1, 'never burst old attacks into a resumed browser');
  now = 30.57;
  queue.pump();
  assert.equal(attacks.length, 2);
  queue.stop();
});
