/** Summarize independent MAESTRO takes without reading WAV or modifying detections. */
import { readFile } from 'node:fs/promises';
import { summarizePianoCorpus } from '../src/core/audio/microphoneConditionAnalysis.ts';
import { validateOfflineRuntimeProfile } from './offline-model-timing.mjs';

const files = process.argv.slice(2);
if (files.length < 2 || files.includes('--help')) {
  console.error('Usage: node --experimental-strip-types scripts/summarize-piano-corpus.mjs <model-a.json> <model-b.json>');
  process.exitCode = 2;
} else {
  try {
    const datasets = await Promise.all(files.map(async path =>
      JSON.parse(await readFile(path, 'utf8'))));
    const summary = summarizePianoCorpus(datasets);
    const offlineRuntimeProfiles = datasets.map(data => {
      if (data.offlineRuntime === undefined) return { engine: data.engine, runtime: null };
      validateOfflineRuntimeProfile(data.offlineRuntime, data.cases);
      return { engine: data.engine, runtime: data.offlineRuntime };
    });
    // No scalar "runtime" or "cold start" exists across two models, three
    // excerpts and separate processes; preserve the unavailable legacy fields.
    console.log(JSON.stringify({
      ...summary, offlineRuntimeProfiles,
      performanceCaveat: 'These are Node.js offline elapsed measurements on shared GitHub CI, NOT microphone capture latency, browser cold start, sustained streaming FPS or a hardware-neutral model ranking'
    }, null, 2));
  } catch (error) {
    console.error('Corpus condition analysis refused: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
