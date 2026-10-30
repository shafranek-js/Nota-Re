import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptSnapshot } from '../src/core/training/exerciseAttempt.ts';

const base = {
  mode: 'reflex', tonality: 'C', bpm: 68, lessonId: 1, noteCount: 4,
  clean: false, assisted: false, lessonPassed: false
};

const event = (noteIndex, outcome, playedNote = 'C4', reactionMs = 450) => ({
  noteIndex, outcome, expectedNote: 'C4', playedNote, reactionMs
});

test('single exercise metrics ignore session history and distinguish mistakes', () => {
  const snapshot = createAttemptSnapshot({
    ...base,
    events: [
      event(0, 'correct', 'C4', 400),
      event(1, 'wrong-pitch', 'D4', 250),
      event(1, 'correct', 'C4', 600),
      event(2, 'late', 'C4', 880),
      event(3, 'missed', null, null)
    ]
  });
  assert.equal(snapshot.judgedEvents, 5);
  assert.equal(snapshot.correctHits, 2);
  assert.equal(snapshot.wrongPitches, 1);
  assert.equal(snapshot.lateHits, 1);
  assert.equal(snapshot.missedSlots, 1);
  assert.equal(snapshot.accuracyPercent, 40);
  assert.equal(snapshot.averageReactionMs, 500);
  assert.equal(snapshot.creditEligible, false);
});

test('assisted exercises cannot be marked credit eligible or given invented timing', () => {
  const snapshot = createAttemptSnapshot({
    ...base, clean: true, assisted: true, lessonPassed: false,
    events: [event(0, 'assisted', null, null), event(1, 'assisted', null, null)]
  });
  assert.equal(snapshot.judgedEvents, 0);
  assert.equal(snapshot.assistedSteps, 2);
  assert.equal(snapshot.accuracyPercent, null);
  assert.equal(snapshot.averageReactionMs, null);
  assert.equal(snapshot.creditEligible, false);
});

test('independent completed exercise can be eligible without falsely claiming course passed', () => {
  const events = [0, 1, 2, 3].map(i => event(i, 'correct', 'C4', 350 + i * 100));
  const snapshot = createAttemptSnapshot({
    ...base, clean: true, lessonPassed: false, events
  });
  assert.equal(snapshot.judgedEvents, 4);
  assert.equal(snapshot.accuracyPercent, 100);
  assert.equal(snapshot.averageReactionMs, 500);
  assert.equal(snapshot.creditEligible, true);
  assert.equal(snapshot.lessonPassed, false);
});

test('standalone snapshots do not mutate when source events change later', () => {
  const events = [event(0, 'correct')];
  const snapshot = createAttemptSnapshot({ ...base, events });
  events[0].playedNote = 'A4';
  events.push(event(1, 'wrong-pitch'));
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0].playedNote, 'C4');
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.events), true);
});

test('empty or invalid timing samples never produce NaN or false course completion', () => {
  const snapshot = createAttemptSnapshot({
    ...base, clean: true, lessonId: null, events: [event(0, 'correct', 'C4', NaN)]
  });
  assert.equal(snapshot.averageReactionMs, null);
  assert.equal(snapshot.creditEligible, false);
  assert.equal(snapshot.accuracyPercent, 100);
});


test('incorrect but completed independent exercise is eligible for series scoring', () => {
  const snapshot = createAttemptSnapshot({
    ...base, noteCount: 2,
    events: [event(0, 'wrong-pitch', 'D4'), event(0, 'correct'),
      event(1, 'correct')],
    clean: false
  });
  assert.equal(snapshot.creditEligible, true);
  assert.equal(snapshot.lessonPassed, false);
});
