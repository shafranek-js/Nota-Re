import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamingAttackTracker } from '../scripts/streaming-attack-tracker.mjs';
import { activationFramesToOnsets } from '../src/core/audio/activationOnsetAdapter.ts';

const note = (midi, prob = .8) => ({ midi, prob });
const frame = (time, notes) => ({ time, notes });

test('incremental emits same onsets as established frame adapter without future lookahead', () => {
  const frames = [
    frame(.011, [note(60)]), frame(.022, [note(60), note(64)]),
    frame(.033, [note(60), note(64)]), frame(.044, []),
    frame(.055, []), frame(.066, []), frame(.077, []),
    frame(.099, [note(60)]), frame(.110, [note(60)]),
    frame(.121, [note(60)]), frame(.132, [note(72)]),
    frame(.143, [note(72)]), frame(.154, [])
  ];
  const tracker = createStreamingAttackTracker();
  const observed = frames.flatMap(f => tracker.push(f));
  const standard = activationFramesToOnsets(frames);
  assert.deepEqual(observed.map(x => ({
    midi: x.midi, onsetMs: x.onsetMs, confidence: x.confidence
  })).sort((a,b) => a.onsetMs - b.onsetMs || a.midi - b.midi),
  standard);
  assert.equal(tracker.stats.seenFrames, frames.length);
  assert.ok(tracker.stats.activePitchStates <= 88);
  assert.ok(observed.every(x => x.confirmedAtMs >= x.onsetMs));
});

test('sustained notes never retrigger, but a real gap allows a fresh attack', () => {
  const tracker = createStreamingAttackTracker();
  const produced = [];
  for (let i = 1; i <= 200; i++) {
    const notes = i < 90 || i > 110 ? [note(60)] : [];
    produced.push(...tracker.push(frame(i * .011, notes)));
  }
  assert.equal(produced.length, 2);
  assert.deepEqual(produced.map(x => x.midi), [60, 60]);
  tracker.reset();
  assert.equal(tracker.stats.activePitchStates, 0);
  assert.equal(tracker.stats.seenFrames, 0);
  assert.equal(tracker.push(frame(.011, [note(60)])).length, 0);
});

test('reject invalid probability, duplicate pitch, backwards time or invalid config', () => {
  for (const cfg of [{ minObservedFrames: 0 }, { maxInactiveGapMs: -1 },
    { minObservedFrames: 21 }, { maxInactiveGapMs: 501 }]) {
    assert.throws(() => createStreamingAttackTracker(cfg), /Invalid/);
  }
  const tracker = createStreamingAttackTracker();
  assert.deepEqual(tracker.push(frame(.1, [])), []);
  for (const bad of [frame(.1, []), frame(-1, []), frame(.2, [note(61, 1.1)]),
    frame(.2, [note(61), note(61)]), frame(.2, [note(14)]),
    frame(.2, 'wrong')]) {
    assert.throws(() => tracker.push(bad), /Invalid/);
  }
});

test('memory stays bounded after thousands of empty frames', () => {
  const tracker = createStreamingAttackTracker({minObservedFrames:1});
  for (let i = 1; i <= 20000; i++) tracker.push(frame(i*.01, i % 5 === 0 ? [note(72)] : []));
  assert.ok(tracker.stats.activePitchStates <= 1);
  assert.equal(tracker.stats.seenFrames, 20000);
});
