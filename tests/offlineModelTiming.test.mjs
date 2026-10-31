import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timeOfflineOperation, describeOfflineRunner, validateOfflineRuntimeProfile
} from '../scripts/offline-model-timing.mjs';

const source = [
  { id: 'take-a', audioSha256: 'a'.repeat(64), durationMs: 14000 },
  { id: 'take-b', audioSha256: 'b'.repeat(64), durationMs: 14000 },
  { id: 'take-c', audioSha256: 'c'.repeat(64), durationMs: 14000 }
];
const profile = () => ({
  kind: 'research-only-node-offline-throughput-v1',
  runner: describeOfflineRunner(),
  modelInitializationMs: 11,
  cases: source.map((x,i) => ({
    ...x, coldModelInvocation: i === 0,
    wavReadDecodeMs: 3, inferenceAndAdapterMs: 7000 + i * 500,
    realtimeFactor: (7000 + i * 500) / x.durationMs
  })),
  firstClipWarmRepeat: {
    id: source[0].id, audioSha256: source[0].audioSha256,
    inferenceAndAdapterMs: 4500, realtimeFactor: 4500/14000,
    identicalDetectedEvents: true
  }
});

test('monotonic measured asynchronous result survives without changing payload', async () => {
  const expected = { note: 60 };
  const result = await timeOfflineOperation(async () => expected);
  assert.equal(result.value, expected);
  assert.ok(Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0);
  await assert.rejects(() => timeOfflineOperation(null), /function/);
});

test('paired timing is only accepted for identical SHA, duration, case and cold markers', () => {
  const valid = profile();
  assert.equal(validateOfflineRuntimeProfile(valid, source), valid);
  const modifications = [
    p => {p.cases[0].audioSha256 = 'd'.repeat(64);},
    p => {p.cases[1].id = 'unexpected';},
    p => {p.cases[0].coldModelInvocation = false;},
    p => {p.cases[2].inferenceAndAdapterMs = -1;},
    p => {p.cases[1].realtimeFactor = 0.01;},
    p => {p.cases[1].durationMs = 13999;},
    p => {p.modelInitializationMs = NaN;},
    p => {p.firstClipWarmRepeat.id = 'take-b';},
    p => {p.firstClipWarmRepeat.realtimeFactor = Infinity;},
    p => {p.firstClipWarmRepeat.identicalDetectedEvents = 'true';}
  ];
  for (const mutate of modifications) {
    const corrupt = profile();
    mutate(corrupt);
    assert.throws(() => validateOfflineRuntimeProfile(corrupt, source), /Invalid|does not match/);
  }
});

test('legacy uninstrumented results can be compared with an explicit missing timing', () => {
  assert.equal(validateOfflineRuntimeProfile({...profile(), firstClipWarmRepeat: null}, source)
    .firstClipWarmRepeat, null);
  const runner = describeOfflineRunner();
  assert.match(runner.node, /^v\d+/);
  assert.ok(runner.logicalCpuCount >= 1);
});
