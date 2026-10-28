import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioClockQueue, sequenceTimeline, syllableTimeline, articulationTimeline
} from '../src/core/audio/audioTimeline.ts';
import { nextAudioDeadline, remainingAudioMs } from '../src/core/training/flowTiming.ts';

test('mixed rhythmic values create exact quarter/eighth/sixteenth time grid', () => {
  const tones = sequenceTimeline([
    { freq: 261.63, durMultiplier: 1 },
    { freq: 293.66, durMultiplier: 0.5 },
    { freq: 329.63, durMultiplier: 0.25 },
    { freq: 349.23, durMultiplier: 2, articulation: 'staccato' }
  ], 60);
  assert.deepEqual(tones.map(n => n.offsetSeconds), [0, 1, 1.5, 1.75]);
  assert.deepEqual(tones.map(n => n.durationSeconds), [0.9, 0.45, 0.225, 0.12]);
  assert.equal(sequenceTimeline([{ freq: 440, durMultiplier: 0.5 }], 120)[0].durationSeconds, 0.225);
  assert.throws(() => sequenceTimeline([{ freq: 440 }], 0), /BPM/);
  assert.throws(() => sequenceTimeline([{ freq: -1 }], 60), /note/);
});

test('syllables and two-hand articulation are aligned to one audio clock', () => {
  assert.deepEqual(syllableTimeline('titi', 60).map(e => e.offsetSeconds),
    [0, 0.5, 1, 2, 2.5, 3]);
  assert.equal(syllableTimeline('tiritiri', 60).length, 10);
  const simultaneous = articulationTimeline(60);
  assert.equal(simultaneous.length, 12);
  assert.equal(simultaneous.filter(e => e.offsetSeconds === 0).length, 2);
  assert.deepEqual([...simultaneous.map(e => e.offsetSeconds)].sort((a, b) => a - b),
    simultaneous.map(e => e.offsetSeconds));
});

test('worklet events retain absolute audio times despite delayed JS pump', () => {
  let now = 10;
  const emitted = [];
  const canceled = [];
  const queue = new AudioClockQueue(
    () => now,
    (event, when) => {
      emitted.push({ freq: event.frequencyHz, when });
      return () => canceled.push(event.frequencyHz);
    }
  );
  const tones = sequenceTimeline([
    { freq: 261.63, durMultiplier: 1 },
    { freq: 293.66, durMultiplier: 0.5 },
    { freq: 329.63, durMultiplier: 0.25 }
  ], 60);
  try {
    queue.start(tones, 0.08);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].when, 10.08);
    now = 11.02; // 60 ms JS delay: note remains scheduled at 11.08
    queue.pump();
    assert.equal(emitted.length, 2);
    assert.equal(emitted[1].when, 11.08);
    now = 11.7; // too late for a 225ms event; skip the stale hit
    queue.pump();
    assert.equal(emitted.length, 3);
    assert.equal(emitted[2].when, 11.7);
  } finally {
    queue.stop();
  }
  assert.deepEqual(canceled, [261.63, 293.66, 329.63]);
});

test('stopped queue cannot dispatch any further previews', () => {
  let now = 3;
  const played = [];
  const queue = new AudioClockQueue(
    () => now,
    (event) => { played.push(event.frequencyHz); return () => {}; }
  );
  queue.start(sequenceTimeline([{ freq: 440 }, { freq: 880 }], 60));
  queue.stop();
  now = 100;
  queue.pump();
  assert.deepEqual(played, [440]);
});

test('absolute note deadlines are independent of delayed callbacks', () => {
  const start = 22;
  const first = nextAudioDeadline(start, { durMultiplier: 0.25 }, 60);
  const second = nextAudioDeadline(first, { durMultiplier: 0.5 }, 60);
  assert.equal(first, 22.25);
  assert.equal(second, 22.75);
  assert.equal(remainingAudioMs(22.1, first), 150);
  assert.equal(remainingAudioMs(22.5, first), 0);
  assert.throws(() => nextAudioDeadline(-1, { durMultiplier: 1 }, 60), /audio time/);
});
