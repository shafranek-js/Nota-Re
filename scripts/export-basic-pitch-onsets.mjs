/**
 * Optional offline reference: Spotify Basic Pitch 1.0.1.
 * This module is never imported by the Vite application or lesson scoring.
 * Requires local 22,050 Hz mono/stereo PCM WAV and a pinned benchmark-only
 * install. Both detectors must consume the SAME converted WAV bytes.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { readPianoWav } from './read-piano-wav.mjs';
import { timeOfflineOperation, describeOfflineRunner, validateOfflineRuntimeProfile } from './offline-model-timing.mjs';
import { basicPitchNotesToOnsets } from '../src/core/audio/basicPitchBenchmarkAdapter.ts';
import { evaluatePianoBenchmark } from '../src/core/audio/microphoneBenchmark.ts';

const require = createRequire(import.meta.url);

async function loadLocalBasicPitch() {
  let pkg, tf, metadata;
  try {
    pkg = require('@spotify/basic-pitch');
    tf = require('@tensorflow/tfjs');
    metadata = require('@spotify/basic-pitch/package.json');
  } catch (error) {
    throw new Error('Missing optional benchmark packages. Run: npm install --no-save --package-lock=false @spotify/basic-pitch@1.0.1 @tensorflow/tfjs@3.21.0', { cause: error });
  }
  if (metadata.version !== '1.0.1' || typeof pkg.BasicPitch !== 'function' ||
      typeof pkg.outputToNotesPoly !== 'function' || typeof pkg.noteFramesToTime !== 'function') {
    throw new Error('Unsupported Basic Pitch package version / API');
  }
  const base = join(dirname(require.resolve('@spotify/basic-pitch/package.json')), 'model');
  const modelJson = await readFile(join(base, 'model.json'));
  const modelConfig = JSON.parse(modelJson.toString('utf8'));
  if (!modelConfig.modelTopology || !Array.isArray(modelConfig.weightsManifest)) {
    throw new Error('Invalid bundled Basic Pitch model manifest');
  }
  const weightSpecs = [];
  const shards = [];
  for (const group of modelConfig.weightsManifest) {
    if (!Array.isArray(group.weights) || !Array.isArray(group.paths)) {
      throw new Error('Invalid Basic Pitch weights manifest');
    }
    weightSpecs.push(...group.weights);
    for (const relativePath of group.paths) {
      if (typeof relativePath !== 'string' || relativePath.includes('..') ||
          relativePath.startsWith('/') || relativePath.includes('\\')) {
        throw new Error('Invalid Basic Pitch model shard path');
      }
      shards.push(await readFile(join(base, relativePath)));
    }
  }
  if (!shards.length) throw new Error('Basic Pitch has no model weights');
  const weightBytes = Buffer.concat(shards);
  const hash = createHash('sha256').update(modelJson).update(weightBytes).digest('hex');
  const weightData = weightBytes.buffer.slice(
    weightBytes.byteOffset, weightBytes.byteOffset + weightBytes.byteLength);
  const model = await tf.loadGraphModel({
    load: async () => ({
      modelTopology: modelConfig.modelTopology,
      weightSpecs,
      weightData,
      format: modelConfig.format,
      generatedBy: modelConfig.generatedBy,
      convertedBy: modelConfig.convertedBy
    })
  });
  return { pkg, tf, hash, model };
}

async function main(path) {
  const file = resolve(path);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) ||
      !manifest.cases.length || !Number.isFinite(manifest.onsetToleranceMs) ||
      manifest.onsetToleranceMs < 0 || manifest.onsetToleranceMs > 1000) {
    throw new Error('Expected benchmark manifest schemaVersion 1, onsetToleranceMs and nonempty cases');
  }

  const initialized = await timeOfflineOperation(loadLocalBasicPitch);
  const { pkg, tf, hash, model } = initialized.value;
  const recognizer = new pkg.BasicPitch(Promise.resolve(model));
  const cases = [];
  const timingCases = [];
  let firstClipWarmRepeat = null;
  try {
    for (const item of manifest.cases) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() ||
          typeof item.category !== 'string' || !item.category.trim() ||
          typeof item.wav !== 'string' || !item.wav.trim() ||
          !Array.isArray(item.expected)) {
        throw new Error('Invalid corpus case metadata');
      }
      const pathToWav = resolve(dirname(file), item.wav);
      const decoded = await timeOfflineOperation(async () => {
        const wavBytes = await readFile(pathToWav);
        const audioSha256 = createHash('sha256').update(wavBytes).digest('hex');
        const audio = await readPianoWav(pathToWav);
        return { audioSha256, ...audio };
      });
      const { audioSha256, samples, sampleRate, durationSeconds } = decoded.value;
      const durationMs = durationSeconds * 1000;
      if (sampleRate !== 22050) {
        throw new Error('Basic Pitch requires 22050 Hz. Convert the shared corpus WAV to 22050 Hz before running BOTH detectors.');
      }
      if (item.audioSha256 !== undefined && item.audioSha256 !== audioSha256) {
        throw new Error('Reference WAV SHA-256 mismatch for ' + item.id);
      }
      if (item.durationMs !== undefined &&
          (!Number.isFinite(item.durationMs) || Math.abs(item.durationMs - durationMs) > 1)) {
        throw new Error('Reference duration mismatch for ' + item.id);
      }
      const infer = async () => {
        const frames = [], onsets = [];
        await recognizer.evaluateModel(samples, (f, o) => {
          frames.push(...f);
          onsets.push(...o);
        }, () => {});
        const events = pkg.noteFramesToTime(
          pkg.outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)
        );
        return basicPitchNotesToOnsets(events);
      };
      const first = await timeOfflineOperation(infer);
      const detected = first.value;
      cases.push({
        id: item.id, category: item.category, audioSha256, durationMs,
        expected: item.expected, detected
      });
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
          identicalDetectedEvents: JSON.stringify(warm.value) === JSON.stringify(detected)
        };
      }
      console.error('Basic Pitch ' + item.id + ': ' + detected.length +
        ' predicted note attacks; offline inference ' + first.elapsedMs.toFixed(1) + 'ms');
    }
  } finally {
    model.dispose();
    tf.disposeVariables();
  }

  // Offline time contains no callback emission timestamps; these are NOT
  // live latency observations.
  const dataset = {
    schemaVersion: 1,
    engine: 'spotify-basic-pitch@1.0.1:tfjs3.21.0:' + hash + ':onset-0.25-frame-0.25',
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
  evaluatePianoBenchmark(dataset);
  console.log(JSON.stringify(dataset, null, 2));
}

if (process.argv.length !== 3 || process.argv[2] === '--help') {
  console.error('Usage: node --experimental-strip-types scripts/export-basic-pitch-onsets.mjs <corpus-manifest.json>');
  process.exitCode = 2;
} else {
  try {
    await main(process.argv[2]);
  } catch (error) {
    console.error('Basic Pitch offline export failed: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
