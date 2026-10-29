import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTwoHandPractice } from '../src/core/training/twoHandPractice.ts';
import {
  currentScoreTick, initialTimedPractice, reduceTimedPractice, ticksToMs
} from '../src/core/training/tempoTwoHand.ts';

const exercise = createTwoHandPractice('C', 8);
const { score, steps } = exercise;
const plan = {
  startMs: 10000, bpm: 60, windowMs: 160, overlapMs: 140, holdGraceMs: 120
};
const on = (note, receivedAtMs, channel = 0) =>
  ({ type: 'note-on', note, receivedAtMs, channel });
const off = (note, receivedAtMs, channel = 0) =>
  ({ type: 'note-off', note, receivedAtMs, channel });
const tick = receivedAtMs => ({ type: 'tick', receivedAtMs });

test('musical tick timeline follows BPM and has no cumulative JS clock drift', () => {
  assert.equal(ticksToMs(4, 60), 1000);
  assert.equal(ticksToMs(2, 120), 250);
  assert.equal(currentScoreTick(plan, 9000, score), 0);
  assert.equal(currentScoreTick(plan, 11500, score), 6);
  assert.equal(currentScoreTick(plan, 999999, score), 32);
});

test('count-in notes do not count; simultaneous RH/LH within beat and overlap do', () => {
  let s = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(48, 9800));
  assert.equal(s.stepIndex, 0);
  assert.equal(s.feedback, 'count-in');
  s = reduceTimedPractice(s, score, steps, plan, off(48, 9990));
  s = reduceTimedPractice(s, score, steps, plan, on(48, 10020, 2));
  s = reduceTimedPractice(s, score, steps, plan, on(60, 10075));
  assert.equal(s.stepIndex, 1);
  assert.equal(s.hits, 1);
  assert.equal(s.lastDeviationMs, 75);
  assert.equal(s.sustained.find(n => n.note === 48)?.untilMs, 12000);
  s = reduceTimedPractice(s, score, steps, plan, off(60, 10930));
  s = reduceTimedPractice(s, score, steps, plan, on(62, 11080));
  assert.equal(s.hits, 2);
  assert.equal(s.earlyReleases, 0);
  s = reduceTimedPractice(s, score, steps, plan, off(48, 11920, 2));
  assert.equal(s.earlyReleases, 0);
});

test('premature left-hand release is flagged across intermediate RH beat', () => {
  let s = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(48, 10000));
  s = reduceTimedPractice(s, score, steps, plan, on(60, 10030));
  s = reduceTimedPractice(s, score, steps, plan, off(60, 10950));
  s = reduceTimedPractice(s, score, steps, plan, on(62, 11020));
  s = reduceTimedPractice(s, score, steps, plan, off(48, 11200));
  assert.equal(s.hits, 2);
  assert.equal(s.earlyReleases, 1);
  assert.equal(s.feedback, 'released-early');
});

test('a lost beat is marked missed and cannot be recovered by playing later', () => {
  let s = reduceTimedPractice(initialTimedPractice(), score, steps, plan, tick(10161));
  assert.equal(s.stepIndex, 1);
  assert.equal(s.misses, 1);
  s = reduceTimedPractice(s, score, steps, plan, on(60, 10300));
  assert.equal(s.stepIndex, 1);
  assert.equal(s.feedback, 'off-beat');
  s = reduceTimedPractice(s, score, steps, plan, on(62, 11015));
  assert.equal(s.hits, 1);
  assert.equal(s.stepIndex, 2);
  s = reduceTimedPractice(s, score, steps, plan, tick(10000 + ticksToMs(32, 60) + 200));
  assert.equal(s.finished, true);
  assert.equal(s.stepIndex, steps.length);
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 7);
});

test('incorrect pitch, duplicate across channels and nonoverlapping chord are rejected', () => {
  let s = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(65, 10000));
  assert.equal(s.wrongPitches, 1);
  s = reduceTimedPractice(s, score, steps, plan, on(48, 10010));
  s = reduceTimedPractice(s, score, steps, plan, on(48, 10020, 2));
  assert.equal(s.stepIndex, 0);
  s = reduceTimedPractice(s, score, steps, plan, on(60, 10100));
  assert.equal(s.stepIndex, 1);
  assert.equal(s.hits, 1);
});

test('late notes and wrong times do not award any course-equivalent hit', () => {
  let s = initialTimedPractice();
  s = reduceTimedPractice(s, score, steps, plan, on(48, 9800));
  assert.equal(s.feedback, 'count-in');
  s = reduceTimedPractice(s, score, steps, plan, off(48, 9950));
  s = reduceTimedPractice(s, score, steps, plan, on(48, 10155));
  s = reduceTimedPractice(s, score, steps, plan, on(60, 10165));
  assert.equal(s.stepIndex, 1, 'onset is already missed after the deadline');
  assert.equal(s.misses, 1);
  assert.equal(s.hits, 0);
});

test('slightly early first attacks count within the symmetric beat window', () => {
  let s = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(48, 9999, 2));
  assert.equal(s.stepIndex, 0);
  assert.equal(s.feedback, 'partial');
  s = reduceTimedPractice(s, score, steps, plan, on(60, 10003));
  assert.equal(s.stepIndex, 1);
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 0);
});
