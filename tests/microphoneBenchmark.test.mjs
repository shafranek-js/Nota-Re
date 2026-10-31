import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluatePianoBenchmark, evaluatePianoBenchmarkCase } from '../src/core/audio/microphoneBenchmark.ts';

const note = (midi, onsetMs, extra = {}) => ({ midi, onsetMs, ...extra });
const check = (expected, detected, tolerance = 100) =>
  evaluatePianoBenchmarkCase({ id: 'test', category: 'test', expected, detected }, tolerance);

test('clean attack has independent onset error and real detection latency', () => {
  const r = check([note(60, 1000)], [note(60, 1015, { emittedAtMs: 1100, confidence: 0.9 })]);
  assert.deepEqual([r.truePositives, r.falsePositives, r.falseNegatives], [1, 0, 0]);
  assert.equal(r.f1, 1);
  assert.equal(r.medianAbsoluteOnsetErrorMs, 15);
  assert.equal(r.medianProcessingLatencyMs, 100);
});

test('octave ghost never substitutes for played lower note or another chord member', () => {
  const r = check([note(48, 1000)], [note(48, 1010), note(60, 1010)]);
  assert.deepEqual([r.truePositives, r.falsePositives, r.falseNegatives], [1, 1, 0]);
  const chord = check([note(60, 0), note(64, 0), note(67, 0)], [note(60, 5), note(67, 5)]);
  assert.deepEqual([chord.truePositives, chord.falsePositives, chord.falseNegatives], [2, 0, 1]);
});

test('one attack cannot be re-used for the next repeated note', () => {
  const r = check([note(60, 0), note(60, 300)], [note(60, 20)]);
  assert.deepEqual([r.truePositives, r.falsePositives, r.falseNegatives], [1, 0, 1]);
});

test('dynamic matching maximizes total attack recall over greedy nearest pairs', () => {
  const r = check([note(60, 0), note(60, 100)], [note(60, 90), note(60, 110)]);
  assert.equal(r.truePositives, 2);
  assert.deepEqual(r.matches.map(m => m.absoluteOnsetErrorMs), [90, 10]);
});

test('duplicate detections and arrivals outside window count as errors', () => {
  const duplicate = check([note(60, 1000)], [note(60, 1000), note(60, 1005)]);
  assert.deepEqual([duplicate.truePositives, duplicate.falsePositives], [1, 1]);
  const late = check([note(60, 1000)], [note(60, 1201)]);
  assert.deepEqual([late.truePositives, late.falsePositives, late.falseNegatives], [0, 1, 1]);
});

test('silence, missing-only and unmeasured emission never inflate grades', () => {
  const silence = check([], []);
  assert.equal(silence.precision, null);
  assert.equal(silence.f1, null);
  const missing = check([note(60, 0)], []);
  assert.equal(missing.recall, 0);
  assert.equal(missing.f1, 0);
  assert.equal(check([note(60, 0)], [note(60, 5)]).medianProcessingLatencyMs, null);
});

test('invalid physical times, MIDI range, detector confidence or tolerance are rejected', () => {
  assert.throws(() => check([note(20, 0)], []), /Invalid/);
  assert.throws(() => check([], [note(60, NaN)]), /Invalid/);
  assert.throws(() => check([], [note(60, 50, { emittedAtMs: 40 })]), /Invalid/);
  assert.throws(() => check([], [note(60, 50, { confidence: 1.1 })]), /Invalid/);
  assert.throws(() => check([], [], -1), /Invalid/);
});

test('fixture is a synthetic, deterministic micro-average, never an engine test result', async () => {
  const data = JSON.parse(await readFile(new URL('./fixtures/microphone-benchmark-example.json', import.meta.url), 'utf8'));
  const report = evaluatePianoBenchmark(data);
  assert.equal(report.engine, 'SYNTHETIC-DEMO-NOT-A-DETECTOR-RESULT');
  assert.deepEqual([report.overall.truePositives, report.overall.falsePositives, report.overall.falseNegatives], [4, 1, 1]);
  assert.equal(report.overall.f1, 0.8);
  assert.throws(() => evaluatePianoBenchmark({ ...data, cases: [data.cases[0], data.cases[0]] }), /unique/);
});
