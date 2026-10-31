import test from 'node:test';
import assert from 'node:assert/strict';
import { replayCausalWindows } from '../scripts/causal-window-replay.mjs';
import { evaluatePianoBenchmarkCase } from '../src/core/audio/microphoneBenchmark.ts';

const samples = () => {
  const audio = new Float32Array(5000 * 8);
  audio.fill(0);
  audio[0] = 0.25;
  audio[1000 * 8] = 0.5;
  audio[2000 * 8] = 0.75;
  audio[4000 * 8] = 1;
  return audio;
};

test('window replay never reads future audio; each attack belongs to one new interval', async () => {
  const requests = [];
  const result = await replayCausalWindows({
    samples: samples(), sampleRate: 8000, windowMs: 2000, hopMs: 1000,
    infer: async ({ samples: audio, startMs, endMs, ownershipStartMs }) => {
      requests.push({ audio, startMs, endMs, ownershipStartMs });
      // An attack from old overlapping context MUST NOT be emitted again.
      return { processingMs: 100, detected: [
        { midi: 60, onsetMs: 1000, confidence: 0.9 },
        { midi: 64, onsetMs: 1500, confidence: 0.7 }
      ] };
    }
  });
  assert.deepEqual(requests.map(x => [x.startMs, x.endMs, x.ownershipStartMs]), [
    [0, 2000, 0], [1000, 3000, 2000], [2000, 4000, 3000],
    [3000, 5000, 4000]
  ]);
  assert.ok(requests.every(x => x.audio.length === 16000));
  assert.equal(requests[0].audio[0], 0.25);
  assert.equal(requests[0].audio[1000 * 8], 0.5);
  assert.ok(!requests[0].audio.includes(0.75), 'first window must not see third second');
  assert.ok(!requests[1].audio.includes(1), 'middle window cannot see final second');
  assert.deepEqual(result.detected.map(x => [x.midi, x.onsetMs]), [
    [60, 1000], [64, 1500], [60, 2000], [64, 2500],
    [60, 3000], [64, 3500], [60, 4000], [64, 4500]
  ]);
  assert.equal(result.maxBacklogMs, 100);
  assert.equal(result.detected[0].emittedAtMs, 2100);
  assert.equal(result.unprocessedTailMs, 0);
  assert.equal(result.windows[0].acceptedAttacks, 2);
});

test('slow serial model accumulates backlog; model cannot emit before input acquisition', async () => {
  const result = await replayCausalWindows({
    samples: samples(), sampleRate: 8000,
    infer: async () => ({
      processingMs: 1700, detected: [{ midi: 60, onsetMs: 1750 }]
    })
  });
  assert.deepEqual(result.windows.map(x => x.virtualCpuFinishMs), [
    3700, 5400, 7100, 8800
  ]);
  assert.deepEqual(result.windows.map(x => x.accumulatedBacklogMs), [
    1700, 2400, 3100, 3800
  ]);
  assert.deepEqual(result.detected.map(x => x.onsetMs), [
    1750, 2750, 3750, 4750
  ]);
  assert.equal(result.detected[0].emittedAtMs, 3700);
  const metrics = evaluatePianoBenchmarkCase({
    id: 'mock', category: 'synthetic',
    expected: [{ midi: 60, onsetMs: 1750 }, { midi: 60, onsetMs: 2750 }],
    detected: result.detected
  }, 100);
  assert.equal(metrics.truePositives, 2);
  assert.equal(metrics.falsePositives, 2);
  assert.equal(metrics.medianProcessingLatencyMs, 2300);
});

test('non-divisible source tail is reported rather than silently counted as analyzed', async () => {
  const result = await replayCausalWindows({
    samples: new Float32Array(3500 * 8), sampleRate: 8000,
    infer: async () => ({ detected: [], processingMs: 10 })
  });
  assert.equal(result.coveredThroughMs, 3000);
  assert.equal(result.unprocessedTailMs, 500);
});

test('rejects lookahead, impossible detections, non-monotonic timing and malformed windows', async () => {
  const audio = samples();
  const argumentsList = [
    { windowMs: 0 }, { hopMs: 5000 }, { sampleRate: 9601 },
    { samples: new Float32Array(1) }
  ];
  for (const broken of argumentsList) {
    await assert.rejects(() => replayCausalWindows({
      samples: audio, sampleRate: 8000,
      infer: async () => ({ detected: [], processingMs: 0 }),
      ...broken
    }), /Invalid|shorter/);
  }
  for (const bad of [
    { detected: [{ midi: 120, onsetMs: 100 }], processingMs: 1 },
    { detected: [{ midi: 60, onsetMs: 3000 }], processingMs: 1 },
    { detected: [{ midi: 60, onsetMs: -1 }], processingMs: 1 },
    { detected: [], processingMs: -100 },
    { detected: [], processingMs: NaN }
  ]) {
    await assert.rejects(() => replayCausalWindows({
      samples: audio, sampleRate: 8000, infer: async () => bad
    }), /Invalid/);
  }
});
