/** CAUSAL windowed PitchPlease research replay; no browser or live microphone. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readPianoWav } from './read-piano-wav.mjs';
import { replayCausalWindows } from './causal-window-replay.mjs';
import { activationFramesToOnsets } from '../src/core/audio/activationOnsetAdapter.ts';
import { evaluatePianoBenchmarkCase } from '../src/core/audio/microphoneBenchmark.ts';
import { describeOfflineRunner } from './offline-model-timing.mjs';

async function run(manifestFile) {
  const file = resolve(manifestFile);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) ||
      !manifest.cases.length || !Number.isFinite(manifest.onsetToleranceMs)) {
    throw new Error('Expected independent research corpus manifest');
  }
  const pkg = await import('@markusstrasser/pitchplease');
  if (pkg.version !== '3.1.0' || typeof pkg.analyze !== 'function') {
    throw new Error('Expected pinned PitchPlease 3.1.0');
  }
  const model = pkg.models.find(m => m.id === 'piano');
  if (!model?.revision) throw new Error('Missing pinned piano model revision');
  const results = [];
  for (const item of manifest.cases) {
    if (!item?.id || !item?.wav || !Array.isArray(item.expected) ||
        !/^[0-9a-f]{64}$/i.test(item.audioSha256)) {
      throw new Error('Incomplete independent MIDI/WAV reference metadata');
    }
    const path = resolve(dirname(file), item.wav);
    const bytes = await readFile(path);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== item.audioSha256) throw new Error('Source WAV hash mismatch: ' + item.id);
    const { samples, sampleRate, durationSeconds } = await readPianoWav(path);
    if (sampleRate !== 22050 || Math.abs(durationSeconds * 1000 - item.durationMs) > 1) {
      throw new Error('Wrong shared WAV duration/rate: ' + item.id);
    }
    const replay = await replayCausalWindows({
      samples, sampleRate, windowMs: 2000, hopMs: 1000,
      infer: async ({ samples: chunk, sampleRate: rate }) => {
        const start = performance.now();
        const frames = await pkg.analyze(chunk, rate, { model: 'piano' });
        const detected = activationFramesToOnsets(frames);
        return { detected, processingMs: performance.now() - start };
      }
    });
    if (replay.unprocessedTailMs > 1) throw new Error('Unprocessed source tail: ' + item.id);
    const metrics = evaluatePianoBenchmarkCase({
      id: item.id, category: item.category, expected: item.expected,
      detected: replay.detected
    }, manifest.onsetToleranceMs);
    const { matches, ...scored } = metrics;
    results.push({
      id: item.id, audioSha256: sha,
      independentReferenceAttacks: item.expected.length,
      durationMs: item.durationMs,
      score: scored,
      replay
    });
    console.error('Causal PitchPlease ' + item.id + ': TP=' + metrics.truePositives +
      ' FP=' + metrics.falsePositives + ' FN=' + metrics.falseNegatives +
      ', windows=' + replay.windows.length + ', max backlog ms=' +
      replay.maxBacklogMs.toFixed(1));
  }
  const report = {
    schemaVersion: 1, experiment: 'research-only-causal-window-replay-v1',
    engine: 'pitchplease@3.1.0:piano:' + model.revision,
    runner: describeOfflineRunner(), onsetToleranceMs: manifest.onsetToleranceMs,
    caveat: 'Repeated independent 2s WAV windows with 1s hop, serial single-worker simulated arrivals; NOT native streaming, live capture latency or user-visible latency. Do not compare directly with whole-clip model scores.',
    results
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv.length !== 3 || process.argv[2] === '--help') {
  console.error('Usage: node --experimental-strip-types scripts/replay-pitchplease-windows.mjs <manifest.json>');
  process.exitCode = 2;
} else {
  try { await run(process.argv[2]); }
  catch (error) {
    console.error('Causal PitchPlease replay refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
