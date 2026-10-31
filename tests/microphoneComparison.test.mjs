import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePianoDetectors } from '../src/core/audio/microphoneComparison.ts';

const hashA = 'a'.repeat(64), hashB = 'b'.repeat(64);
const item = (midi, onsetMs) => ({ midi, onsetMs });
const sample = (engine, options = {}) => ({
  schemaVersion: 1,
  engine,
  onsetToleranceMs: 100,
  cases: [
    {
      id: 'chord-1', category: 'chord', audioSha256: hashA, durationMs: 2000,
      expected: [item(60, 1000), item(64, 1000), item(67, 1000)],
      detected: options.omitChord
        ? [item(60, 1010), item(67, 1010)]
        : [item(60, 1010), item(64, 1010), item(67, 1010)]
    },
    {
      id: 'silence-1', category: 'silence', audioSha256: hashB, durationMs: 3000,
      expected: [],
      detected: options.ghost ? [item(72, 500)] : []
    }
  ]
});

test('reconciles exactly identical audio hashes and reference attacks across engines', () => {
  const a = sample('pitchplease', { omitChord: true, ghost: true });
  const b = sample('basicpitch');
  b.cases.reverse();
  b.cases[1].expected.reverse();
  const result = comparePianoDetectors([a, b]);
  assert.equal(result.caseCount, 2);
  assert.equal(result.totalAudioDurationMs, 5000);
  assert.deepEqual(result.categories, ['chord', 'silence']);
  assert.deepEqual([
    result.models[0].overall.truePositives,
    result.models[0].overall.falsePositives,
    result.models[0].overall.falseNegatives
  ], [2, 1, 1]);
  assert.equal(result.models[0].overall.f1, 2 / 3);
  assert.equal(result.models[0].overall.falsePositivesPerMinute, 12);
  assert.equal(result.models[0].overall.detectedLatencySamples, 0);
  assert.equal(result.models[0].overall.medianProcessingLatencyMs, null);
  assert.equal(result.models[1].overall.f1, 1);
  assert.equal(result.models[0].byCategory[1].falsePositives, 1);
});

test('rejects different audio bytes even when all target notes match', () => {
  const b = sample('basicpitch');
  b.cases[0].audioSha256 = hashB;
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), b]), /Different audio/);
});

test('rejects mismatched ground truth and missing case even when overall counts match', () => {
  const b = sample('basicpitch');
  b.cases[0].expected[0].onsetMs += 1;
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), b]), /Different audio/);
  const c = sample('basicpitch');
  c.cases[1].id = 'different-case';
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), c]), /Different audio/);
});

test('rejects duration, category, scoring tolerance or duplicate model identity', () => {
  const mutations = [
    data => { data.cases[0].durationMs += 100; },
    data => { data.cases[0].category = 'single'; },
    data => { data.onsetToleranceMs = 50; }
  ];
  for (const mutate of mutations) {
    const b = sample('basicpitch');
    mutate(b);
    assert.throws(() => comparePianoDetectors([sample('pitchplease'), b]));
  }
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), sample('pitchplease')]), /Duplicate/);
  assert.throws(() => comparePianoDetectors([sample('only-one')]), /At least two/);
});

test('does not present unverified or malformed audio as a fair benchmark', () => {
  const b = sample('basicpitch');
  delete b.cases[0].audioSha256;
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), b]), /Unverified/);
  const c = sample('basicpitch');
  c.cases[0].audioSha256 = 'placeholder';
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), c]), /Unverified/);
  const d = sample('basicpitch');
  d.cases[0].durationMs = 0;
  assert.throws(() => comparePianoDetectors([sample('pitchplease'), d]), /Unverified/);
});
