/** Research-only offline model throughput; never a device/microphone latency estimate. */
import os from 'node:os';
import { performance } from 'node:perf_hooks';

export async function timeOfflineOperation(fn) {
  if (typeof fn !== 'function') throw new Error('Timing target must be a function');
  const start = performance.now();
  const value = await fn();
  const elapsedMs = performance.now() - start;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('Invalid monotonic timing measurement');
  }
  return { value, elapsedMs };
}

export function describeOfflineRunner() {
  const cpus = os.cpus();
  return {
    node: process.version, platform: process.platform, arch: process.arch,
    logicalCpuCount: cpus.length,
    firstCpuModel: cpus[0]?.model ?? null,
    ci: process.env.CI === 'true',
    runnerOs: process.env.RUNNER_OS ?? null,
    githubRunId: process.env.GITHUB_RUN_ID ?? null
  };
}

const finiteNonnegative = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/** Reject fabricated/accidentally corrupt timing before it reaches any report. */
export function validateOfflineRuntimeProfile(profile, expectedCases) {
  if (!profile || profile.kind !== 'research-only-node-offline-throughput-v1' ||
      !profile.runner || typeof profile.runner.node !== 'string' ||
      !finiteNonnegative(profile.modelInitializationMs) ||
      !Array.isArray(profile.cases) ||
      profile.cases.length !== expectedCases.length) {
    throw new Error('Invalid offline timing metadata');
  }
  for (let i = 0; i < expectedCases.length; i++) {
    const item = profile.cases[i];
    const source = expectedCases[i];
    if (item.id !== source.id || item.audioSha256 !== source.audioSha256 ||
        item.durationMs !== source.durationMs ||
        item.coldModelInvocation !== (i === 0) ||
        !finiteNonnegative(item.wavReadDecodeMs) ||
        !finiteNonnegative(item.inferenceAndAdapterMs) ||
        !finiteNonnegative(item.realtimeFactor) ||
        Math.abs(item.realtimeFactor - item.inferenceAndAdapterMs / item.durationMs) > 1e-6) {
      throw new Error('Offline timing does not match shared reference WAV ' + source.id);
    }
  }
  const warm = profile.firstClipWarmRepeat;
  if (warm !== null && (warm.id !== expectedCases[0].id ||
      warm.audioSha256 !== expectedCases[0].audioSha256 ||
      !finiteNonnegative(warm.inferenceAndAdapterMs) ||
      !finiteNonnegative(warm.realtimeFactor) ||
      Math.abs(warm.realtimeFactor -
        warm.inferenceAndAdapterMs / expectedCases[0].durationMs) > 1e-6 ||
      typeof warm.identicalDetectedEvents !== 'boolean')) {
    throw new Error('Invalid same-WAV warm repeat timing');
  }
  return profile;
}
