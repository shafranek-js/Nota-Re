import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePianoBenchmark, diagnosePianoBenchmarkCase } from '../src/core/audio/microphoneFailureAnalysis.ts';
import { evaluatePianoBenchmarkCase } from '../src/core/audio/microphoneBenchmark.ts';

const note = (midi, onsetMs) => ({ midi, onsetMs });

test('uses exactly the scored one-to-one matches, including true octaves', () => {
  const data = {
    id: 'octave', category: 'poly',
    expected: [note(48, 100), note(60, 100), note(64, 100)],
    detected: [note(48, 105), note(60, 107), note(72, 107)]
  };
  const report = diagnosePianoBenchmarkCase(data, 100);
  const baseline = evaluatePianoBenchmarkCase(data, 100);
  assert.deepEqual(
    [report.truePositives, report.falsePositives, report.falseNegatives],
    [baseline.truePositives, baseline.falsePositives, baseline.falseNegatives]
  );
  assert.deepEqual([report.truePositives, report.falsePositives, report.falseNegatives], [2, 1, 1]);
  assert.equal(report.falsePositivesAtReferenceOctave12, 1,
    'extra 72 is an octave from 60, but that does not prove an overtone');
  assert.equal(report.falsePositivesCoincidentWithAnyTruth, 1);
  assert.equal(report.byRegister.reduce((x, y) => x + y.truePositives, 0), 2);
  assert.equal(report.byRegister.reduce((x, y) => x + y.falseNegatives, 0), 1);
  assert.equal(report.byRegister.reduce((x, y) => x + y.falsePositives, 0), 1);
});

test('unmatched same-pitch delayed attack is reported independently from a harmonic', () => {
  const report = diagnosePianoBenchmarkCase({
    id: 'late', category: 'single',
    expected: [note(60, 300)],
    detected: [note(60, 450), note(72, 300)]
  }, 100);
  assert.equal(report.truePositives, 0);
  assert.equal(report.falsePositivesNearSamePitchOutsideTolerance, 1);
  assert.equal(report.falsePositivesAtReferenceOctave12, 1);
  assert.equal(report.medianSignedMatchedOnsetErrorMs, null);
});

test('reports median signed matched onset offset without treating it as I/O latency', () => {
  const report = diagnosePianoBenchmarkCase({
    id: 'time', category: 'single',
    expected: [note(60, 100), note(62, 300)],
    detected: [note(60, 120), note(62, 320)]
  }, 100);
  assert.equal(report.medianSignedMatchedOnsetErrorMs, 20);
  assert.equal(report.falsePositives, 0);
});

test('aggregates totals without hiding missing or duplicate attack events', () => {
  const dataset = {
    schemaVersion: 1, engine: 'test-detector', onsetToleranceMs: 100,
    cases: [
      { id: 'a', category: 'single', expected: [note(60, 100)], detected: [note(60, 105), note(60, 108)] },
      { id: 'b', category: 'silent', expected: [], detected: [] }
    ]
  };
  const result = diagnosePianoBenchmark(dataset);
  assert.deepEqual([result.aggregate.truePositives, result.aggregate.falsePositives,
    result.aggregate.falseNegatives], [1, 1, 0]);
  assert.equal(result.cases[1].medianSignedMatchedOnsetErrorMs, null);
  assert.throws(() => diagnosePianoBenchmark({ ...dataset, cases: [{
    ...dataset.cases[0], detected: [note(109, 105)]
  }] }), /Invalid/);
});
