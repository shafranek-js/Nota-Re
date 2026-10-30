import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lessonThreeOnsetToleranceMs, isLessonThreeLateOnset, countRhythmOutcomes
} from '../src/core/training/lessonThreeRhythm.ts';
import { judgeExerciseNote } from '../src/core/training/noteJudgment.ts';
import { createAttemptSnapshot } from '../src/core/training/exerciseAttempt.ts';

test('lesson 3 onset window scales with true note duration and is capped', () => {
  const note = (durMultiplier) => ({ durMultiplier });
  assert.equal(lessonThreeOnsetToleranceMs(note(1), 60), 200);
  assert.equal(lessonThreeOnsetToleranceMs(note(0.5), 60), 100);
  assert.equal(lessonThreeOnsetToleranceMs(note(0.25), 60), 50);
  assert.equal(lessonThreeOnsetToleranceMs(note(1), 120), 100);
  assert.equal(lessonThreeOnsetToleranceMs(note(2), 60), 200);
  assert.throws(() => lessonThreeOnsetToleranceMs(note(0), 60), /duration/);
  assert.throws(() => lessonThreeOnsetToleranceMs(note(1), 0), /BPM/);
});

test('right pitch 900 ms after a 60 BPM downbeat is late, not correct', () => {
  const quarter = { durMultiplier: 1 };
  for (const elapsed of [0, 75, 199, 200]) {
    assert.equal(isLessonThreeLateOnset(quarter, 60, elapsed), false);
    assert.equal(judgeExerciseNote(60, 'C4', isLessonThreeLateOnset(quarter, 60, elapsed)), 'correct');
  }
  for (const elapsed of [201, 650, 900, 1000, Infinity]) {
    assert.equal(isLessonThreeLateOnset(quarter, 60, elapsed), true);
    assert.equal(judgeExerciseNote(60, 'C4', isLessonThreeLateOnset(quarter, 60, elapsed)), 'late');
  }
  assert.equal(judgeExerciseNote(60, 'D4', true), 'wrong-pitch',
    'wrong pitch stays an error even when played off-beat');
});

test('each note is counted exactly once as correct, wrong, late or missed', () => {
  const outcomes = ['correct', 'wrong-pitch', 'late', 'missed', 'assisted'];
  const counts = countRhythmOutcomes(outcomes.map(outcome => ({ outcome })));
  assert.deepEqual(counts, { correct: 1, wrongPitch: 1, late: 1, missed: 1 });
  const events = outcomes.slice(0, 4).map((outcome, noteIndex) => ({
    noteIndex, expectedNote: 'C4', playedNote: outcome === 'missed' ? null : 'C4',
    outcome, reactionMs: outcome === 'missed' ? null : 400
  }));
  const snapshot = createAttemptSnapshot({
    mode: 'reflex', tonality: 'C', bpm: 60, lessonId: 3, noteCount: 4,
    events, clean: false, assisted: false, lessonPassed: false
  });
  assert.equal(snapshot.creditEligible, true, 'complete attempt remains eligible for window even with errors');
  assert.equal(snapshot.accuracyPercent, 25, 'late and missing notes lower series accuracy');
  assert.equal(snapshot.missedSlots, 1);
  assert.equal(snapshot.lateHits, 1);
});
