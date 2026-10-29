import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreFromTimedHands, toMusicXml } from '../src/core/notation/musicXml.ts';
import { createTwoHandPractice } from '../src/core/training/twoHandPractice.ts';
import { initialTimedPractice, reduceTimedPractice, ticksToMs } from '../src/core/training/tempoTwoHand.ts';

const all = ['C', 'G', 'F', 'D'];
const cases = ['steady', 'eighth-rests', 'staggered'];
const plan = { startMs: 10000, bpm: 60, windowMs: 160, overlapMs: 140, holdGraceMs: 120 };
const on = (note, t, channel = 0) =>
  ({ type: 'note-on', note, channel, receivedAtMs: t });
const off = (note, t, channel = 0) =>
  ({ type: 'note-off', note, channel, receivedAtMs: t });
const tick = receivedAtMs => ({ type: 'tick', receivedAtMs });

test('all three patterns export two genuine independent staff timelines and 4/4 measures', () => {
  for (const tonality of all) {
    for (const count of [8, 16]) {
      for (const pattern of cases) {
        const { score, steps } = createTwoHandPractice(tonality, count, pattern);
        assert.equal(score.notes.length > 0, true);
        assert.ok(score.notes.some(n => n.staff === 1));
        assert.ok(score.notes.some(n => n.staff === 2));
        assert.equal(Math.max(...score.notes.map(n => n.onsetTicks + n.durationTicks)), count * 4);
        assert.ok(steps.every((step, index) =>
          step.durationTicks > 0 &&
          step.expectedMidi.length > 0 &&
          (index === 0 || step.onsetTicks > steps[index - 1].onsetTicks)));
        const xml = toMusicXml(score);
        assert.equal((xml.match(/<measure number="/g) ?? []).length, count / 4);
        assert.equal((xml.match(/<backup><duration>16<\/duration><\/backup>/g) ?? []).length, count / 4);
        assert.ok(xml.includes('<staff>1</staff>') && xml.includes('<staff>2</staff>'));
        if (pattern !== 'steady') assert.match(xml, /<rest\/>/);
      }
    }
  }
});

test('eighth-rests has different note-entry times and independent silence in both hands', () => {
  const { score, steps } = createTwoHandPractice('C', 8, 'eighth-rests');
  assert.deepEqual(score.notes.filter(n => n.staff === 1).map(n => n.onsetTicks),
    [0, 2, 4, 10, 12, 16, 18, 20, 26, 28]);
  assert.deepEqual(score.notes.filter(n => n.staff === 2).map(n => n.onsetTicks),
    [0, 6, 8, 20, 24]);
  assert.deepEqual(steps.map(s => s.onsetTicks),
    [0, 2, 4, 6, 8, 10, 12, 16, 18, 20, 24, 26, 28]);
  assert.equal(steps[0].expectedMidi.length, 2);
  assert.equal(steps.find(s => s.onsetTicks === 8).expectedMidi.length, 1);
  assert.equal(steps.find(s => s.onsetTicks === 20).expectedMidi.length, 2);
  assert.match(toMusicXml(score), /<rest\/>/);
});

test('staggered has an initial RH eighth rest, dotted values and shared rest', () => {
  const { score, steps } = createTwoHandPractice('C', 8, 'staggered');
  const right = score.notes.filter(n => n.staff === 1);
  const left = score.notes.filter(n => n.staff === 2);
  assert.equal(right[0].onsetTicks, 2);
  assert.equal(left[0].onsetTicks, 0);
  assert.ok(right.some(n => n.durationTicks === 6));
  assert.ok(left.some(n => n.durationTicks === 6));
  const restingAt = 16;
  assert.ok(score.notes.every(n =>
    !(n.onsetTicks <= restingAt && restingAt < n.onsetTicks + n.durationTicks)));
  assert.deepEqual(steps[0].expectedMidi, [48], 'only left hand enters on the downbeat');
  assert.ok(steps.some(s => s.onsetTicks === 18 && s.expectedMidi.length === 2));
  const xml = toMusicXml(score);
  assert.match(xml, /<note><rest\/><duration>2<\/duration>/);
  assert.match(xml, /<dot\/>/);
});

test('explicit staff gaps and two-note chord have valid MusicXML without fabricated pitches', () => {
  const score = createScoreFromTimedHands([
    { midi: 60, onsetTicks: 2, durationTicks: 2 },
    { midi: 64, onsetTicks: 2, durationTicks: 2 },
    { midi: 67, onsetTicks: 8, durationTicks: 4 }
  ], [{ midi: 48, onsetTicks: 0, durationTicks: 6 }], 'C');
  const xml = toMusicXml(score);
  assert.match(xml, /<chord\/>/);
  assert.match(xml, /<rest\/>/);
  assert.equal(score.notes.filter(n => n.staff === 1).length, 3);
  assert.throws(() => createScoreFromTimedHands([
    { midi: 60, onsetTicks: 0, durationTicks: 6 },
    { midi: 62, onsetTicks: 4, durationTicks: 4 }
  ], [], 'C'), /Overlapping notes/);
  assert.throws(() => createScoreFromTimedHands([
    { midi: 60, onsetTicks: 0, durationTicks: 4 },
    { midi: 64, onsetTicks: 0, durationTicks: 2 }
  ], [], 'C'), /share a duration/);
  assert.throws(() => createScoreFromTimedHands([
    { midi: 60, onsetTicks: 0, durationTicks: 4 },
    { midi: 60, onsetTicks: 0, durationTicks: 4 }
  ], [], 'C'), /unique/);
  assert.throws(() => createScoreFromTimedHands([
    { midi: 60, onsetTicks: -1, durationTicks: 4 }
  ], [], 'C'), /Invalid/);
});

test('held note across a rest is counted as overheld once even without NoteOff', () => {
  const { score, steps } = createTwoHandPractice('C', 8, 'staggered');
  let s = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(48, 10000));
  assert.equal(s.hits, 1);
  s = reduceTimedPractice(s, score, steps, plan, tick(10000 + ticksToMs(6, 60) + 121));
  assert.equal(s.overheldNotes, 1, 'LH duration is six ticks, then rest');
  assert.equal(s.feedback, 'held-too-long');
  s = reduceTimedPractice(s, score, steps, plan, tick(10000 + ticksToMs(8, 60)));
  assert.equal(s.overheldNotes, 1, 'repeated timer ticks do not count one hold twice');
  s = reduceTimedPractice(s, score, steps, plan, off(48, 10000 + ticksToMs(9, 60)));
  assert.equal(s.overheldNotes, 1);
});

test('correct release avoids overhold, early release retains its separate penalty', () => {
  const { score, steps } = createTwoHandPractice('C', 8, 'staggered');
  let a = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(48, 10000));
  a = reduceTimedPractice(a, score, steps, plan, off(48, 10000 + ticksToMs(6, 60) - 40));
  a = reduceTimedPractice(a, score, steps, plan, tick(10000 + ticksToMs(9, 60)));
  assert.equal(a.earlyReleases, 0);
  assert.equal(a.overheldNotes, 0);
  let b = reduceTimedPractice(initialTimedPractice(), score, steps, plan, on(48, 10000));
  b = reduceTimedPractice(b, score, steps, plan, off(48, 10000 + ticksToMs(3, 60)));
  assert.equal(b.earlyReleases, 1);
  assert.equal(b.overheldNotes, 0);
});
