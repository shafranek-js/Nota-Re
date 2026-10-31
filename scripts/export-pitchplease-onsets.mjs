/** Offline benchmark only; no microphone, certificate, UI or course scoring integration. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readPianoWav } from './read-piano-wav.mjs';
import { timeOfflineOperation, describeOfflineRunner, validateOfflineRuntimeProfile } from './offline-model-timing.mjs';
import { activationFramesToOnsets } from '../src/core/audio/activationOnsetAdapter.ts';
import { evaluatePianoBenchmark } from '../src/core/audio/microphoneBenchmark.ts';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] === '--help') {
  console.error('Usage: node --experimental-strip-types scripts/export-pitchplease-onsets.mjs <corpus-manifest.json>');
  console.error('Install benchmark-only dependency separately: npm install --no-save --package-lock=false @markusstrasser/pitchplease@3.1.0');
  process.exitCode = 2;
} else {
  try {
    const file = resolve(args[0]);
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) ||
        !manifest.cases.length || !Number.isFinite(manifest.onsetToleranceMs) ||
        manifest.onsetToleranceMs < 0 || manifest.onsetToleranceMs > 1000) {
      throw new Error('Manifest must have schemaVersion 1, onsetToleranceMs 0..1000 and nonempty cases');
    }

    const initialized = await timeOfflineOperation(async () => {
      let packageApi;
      try {
        packageApi = await import('@markusstrasser/pitchplease');
      } catch (error) {
        throw new Error(
          'Install pinned benchmark-only dependency: npm install --no-save --package-lock=false @markusstrasser/pitchplease@3.1.0',
          { cause: error }
        );
      }
      if (packageApi.version !== '3.1.0') {
        throw new Error('Unexpected PitchPlease version: require exactly 3.1.0');
      }
      const model = packageApi.models.find(item => item.id === 'piano');
      if (!model?.revision || typeof packageApi.analyze !== 'function') {
        throw new Error('Missing supported PitchPlease piano model or offline analysis API');
      }
      return { packageApi, model };
    });
    const { packageApi, model } = initialized.value;
    const cases = [];
    const timingCases = [];
    let firstClipWarmRepeat = null;
    for (const item of manifest.cases) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() ||
          typeof item.category !== 'string' || !item.category.trim() ||
          typeof item.wav !== 'string' || !item.wav.trim() ||
          !Array.isArray(item.expected)) {
        throw new Error('Invalid corpus case metadata');
      }
      const filename = resolve(dirname(file), item.wav);
      const decoded = await timeOfflineOperation(async () => {
        const sourceBytes = await readFile(filename);
        const audioSha256 = createHash('sha256').update(sourceBytes).digest('hex');
        const audio = await readPianoWav(filename);
        return { audioSha256, ...audio };
      });
      const { audioSha256, samples, sampleRate, durationSeconds } = decoded.value;
      const durationMs = durationSeconds * 1000;
      if (item.audioSha256 !== undefined && item.audioSha256 !== audioSha256) {
        throw new Error('Reference audio SHA-256 mismatch for ' + item.id);
      }
      if (item.durationMs !== undefined &&
          (!Number.isFinite(item.durationMs) || Math.abs(item.durationMs - durationMs) > 1)) {
        throw new Error('Reference audio duration mismatch for ' + item.id);
      }
      const infer = async () => {
        const frames = await packageApi.analyze(samples, sampleRate, { model: 'piano' });
        return { frameCount: frames.length, detected: activationFramesToOnsets(frames) };
      };
      const first = await timeOfflineOperation(infer);
      const { frameCount, detected } = first.value;
      cases.push({ id: item.id, category: item.category, audioSha256,
        durationMs, expected: item.expected, detected });
      timingCases.push({
        id: item.id, audioSha256, durationMs,
        coldModelInvocation: timingCases.length === 0,
        wavReadDecodeMs: decoded.elapsedMs,
        inferenceAndAdapterMs: first.elapsedMs,
        realtimeFactor: first.elapsedMs / durationMs
      });
      if (timingCases.length === 1) {
        const warm = await timeOfflineOperation(infer);
        firstClipWarmRepeat = {
          id: item.id, audioSha256,
          inferenceAndAdapterMs: warm.elapsedMs,
          realtimeFactor: warm.elapsedMs / durationMs,
          identicalDetectedEvents: JSON.stringify(warm.value.detected) === JSON.stringify(detected)
        };
      }
      console.error(`Analyzed ${item.id}: ${frameCount} frames, ${detected.length} estimated attacks; offline inference ${first.elapsedMs.toFixed(1)}ms`);
    }

    // The exact model revision is recorded. Offline analyze() is not live,
    // so emittedAtMs is deliberately absent: real-time latency is unknown.
    const dataset = {
      schemaVersion: 1,
      engine: `pitchplease@3.1.0:piano:${model.revision}:activation-frame-r0`,
      onsetToleranceMs: manifest.onsetToleranceMs,
      cases,
      offlineRuntime: {
        kind: 'research-only-node-offline-throughput-v1',
        runner: describeOfflineRunner(),
        modelInitializationMs: initialized.elapsedMs,
        cases: timingCases,
        firstClipWarmRepeat
      }
    };
    validateOfflineRuntimeProfile(dataset.offlineRuntime, cases);
    evaluatePianoBenchmark(dataset); // validates exported events
    console.log(JSON.stringify(dataset, null, 2));
  } catch (error) {
    console.error('Cannot export PitchPlease baseline: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
