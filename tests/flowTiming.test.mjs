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
    { durMultiplier: 0.5 }, { durMultiplier: 3 }, { durMultiplier: 4 }];
  assert.deepEqual(notes.map((_, i) => startsMeasure(notes, i)),
    [true, false, true, false, false, true]);
  assert.equal(startsMeasure(notes, -1), false);
  assert.equal(startsMeasure(notes, notes.length), false);
});

const lessonEvent = (noteIndex, outcome = 'correct', reactionMs = 400) => ({
  noteIndex, outcome, reactionMs, expectedNote: 'C4',
  playedNote: outcome === 'missed' ? null : 'C4'
});
const previous = {
  completedExercises: 9, judgedNotes: 144, correctNotes: 135,
  reactionTotalMs: 135 * 400, reactionSamples: 135
};
const normal = {
  previous, noteCount: 16,
  events: Array.from({ length: 16 }, (_, i) => lessonEvent(i, i === 0 ? 'wrong-pitch' : 'correct')),
  assisted: false, targetRepetitions: 10,
  requiredAccuracy: 90, maximumReactionMs: 800, lessonActive: true
};

test('completed exercises count despite an incorrect pitch; course uses series accuracy', () => {
  const result = evaluateLessonCredit(normal);
  assert.equal(result.credited, true);
  assert.equal(result.creditedRepetitions, 10);
  assert.equal(result.evidence.correctNotes, 150);
  assert.equal(result.evidence.judgedNotes, 160);
  assert.equal(result.accuracy, 93.75);
  assert.equal(result.passed, true);
});

test('do not certify before the normative number or without active lesson', () => {
  assert.equal(evaluateLessonCredit({ ...normal, previous: { ...previous, completedExercises: 8 } }).passed, false);
  const free = evaluateLessonCredit({ ...normal, lessonActive: false });
  assert.equal(free.credited, false);
  assert.deepEqual(free.evidence, previous);
  assert.equal(free.passed, false);
});

test('misses and corrections count as failed strikes, not clean notes', () => {
  const events = [lessonEvent(0, 'wrong-pitch'), lessonEvent(0, 'correct'),
    lessonEvent(1, 'missed'), lessonEvent(2, 'correct')];
  const result = evaluateLessonCredit({ ...normal, noteCount: 3, events,
    previous: { completedExercises: 0, judgedNotes: 0, correctNotes: 0, reactionTotalMs: 0, reactionSamples: 0 },
    targetRepetitions: 1 });
  assert.equal(result.creditedRepetitions, 1);
  assert.equal(result.evidence.judgedNotes, 4);
  assert.equal(result.evidence.correctNotes, 2);
  assert.equal(result.accuracy, 50);
  assert.equal(result.passed, false);
});

test('assistance or incomplete evidence never increases an existing series', () => {
  for (const input of [
    { assisted: true }, { events: [lessonEvent(0)] },
    { events: [...normal.events, lessonEvent(0, 'assisted')] }
  ]) {
    const result = evaluateLessonCredit({ ...normal, ...input });
    assert.equal(result.credited, false);
    assert.deepEqual(result.evidence, previous);
    assert.equal(result.passed, false);
  }
});

test('course speed uses all correct note reactions, not the last 15 samples', () => {
  const result = evaluateLessonCredit({ ...normal, previous: {
    ...previous, reactionTotalMs: 135 * 900
  } });
  assert.equal(result.passed, false);
  assert.ok(result.averageReactionMs > 800);
});

test('invalid reaction times cannot produce a false pass', () => {
  const result = evaluateLessonCredit({ ...normal,
    events: normal.events.map((event, i) =>
      i === 1 ? { ...event, reactionMs: Number.NaN } : event)
  });
  assert.equal(result.passed, false);
  assert.equal(result.evidence.reactionSamples, 149);
});

test('accuracy threshold is exact and includes wrong or missed slots', () => {
  const result = evaluateLessonCredit({ ...normal, previous: {
    ...previous, correctNotes: 128
  } });
  assert.ok(result.accuracy < 90);
  assert.equal(result.passed, false);
});
