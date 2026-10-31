/** Summarize independent MAESTRO takes without reading WAV or modifying detections. */
import { readFile } from 'node:fs/promises';
import { summarizePianoCorpus } from '../src/core/audio/microphoneConditionAnalysis.ts';

const files = process.argv.slice(2);
if (files.length < 2 || files.includes('--help')) {
  console.error('Usage: node --experimental-strip-types scripts/summarize-piano-corpus.mjs <model-a.json> <model-b.json>');
  process.exitCode = 2;
} else {
  try {
    const datasets = await Promise.all(files.map(async path =>
      JSON.parse(await readFile(path, 'utf8'))));
    console.log(JSON.stringify(summarizePianoCorpus(datasets), null, 2));
  } catch (error) {
    console.error('Corpus condition analysis refused: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
