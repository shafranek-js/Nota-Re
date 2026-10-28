import test from 'node:test';
import assert from 'node:assert/strict';
import { noteDurationMs, startsMeasure, evaluateLessonCredit } from '../src/core/training/flowTiming.ts';

test('flow deadlines follow note lengths and BPM', () => {
  assert.equal(noteDurationMs({ durMultiplier: 1 }, 60), 1000);
  assert.equal(noteDurationMs({ durMultiplier: 0.25 }, 60), 250);
  assert.equal(noteDurationMs({ durMultiplier: 0.5 }, 120), 250);
  assert.equal(noteDurationMs({ durMultiplier: 2 }, 60), 2000);
  assert.equal(noteDurationMs({ durMultiplier: 4 }, 40), 6000);
  assert.throws(() => noteDurationMs({ durMultiplier: 1 }, 0), /BPM/);
  assert.throws(() => noteDurationMs({ durMultiplier: 0 }, 60), /duration/);
});

test('metronome measure accents use real onset, not every fourth note', () => {
  const notes = [{ durMultiplier: 2 }, { durMultiplier: 2 }, { durMultiplier: 0.5 },
    { durMultiplier: 0.5 }, { durMultiplier: 1 }, { durMultiplier: 4 }];
  assert.deepEqual(notes.map((_, i) => startsMeasure(notes, i)),
    [true, false, true, false, false, true]);
  assert.equal(startsMeasure(notes, -1), false);
  assert.equal(startsMeasure(notes, notes.length), false);
});

const normal = {
  clean: true, assisted: false, completedBefore: 9, targetRepetitions: 10,
  totalAttempts: 160, correctHits: 160, reactionTimes: [250, 350, 400],
  requiredAccuracy: 90, maximumReactionMs: 800, lessonActive: true
};

test('award only sufficiently measured, independently played repetitions', () => {
  assert.equal(evaluateLessonCredit(normal).passed, true);
  assert.equal(evaluateLessonCredit({ ...normal, completedBefore: 8 }).passed, false);
  assert.equal(evaluateLessonCredit({ ...normal, lessonActive: false }).passed, false);
  assert.equal(evaluateLessonCredit({ ...normal, reactionTimes: [] }).passed, false);
  assert.equal(evaluateLessonCredit({ ...normal, totalAttempts: 0, correctHits: 0 }).passed, false);
  assert.equal(evaluateLessonCredit({ ...normal, reactionTimes: [300, 9000] }).passed, false);
});

test('no credit for misses, incorrect notes or assisted steps', () => {
  for (const input of [
    { clean: false }, { assisted: true }, { clean: false, totalAttempts: 160, correctHits: 0 }
  ]) {
    const result = evaluateLessonCredit({ ...normal, ...input });
    assert.equal(result.creditedRepetitions, 0);
    assert.equal(result.passed, false);
  }
});

test('accuracy uses real misses and does not round a below-threshold result up', () => {
  const result = evaluateLessonCredit({
    ...normal, totalAttempts: 199, correctHits: 179,
    requiredAccuracy: 90
  });
  assert.ok(result.accuracy < 90);
  assert.equal(result.passed, false);
});
