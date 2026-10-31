/** Investigate false notes without altering model outputs or lesson scoring. */
import { readFile } from 'node:fs/promises';
import { diagnosePianoBenchmark } from '../src/core/audio/microphoneFailureAnalysis.ts';

const files = process.argv.slice(2);
if (!files.length || files.includes('--help')) {
  console.error('Usage: node --experimental-strip-types scripts/diagnose-piano-errors.mjs <detector-results.json> [more.json]');
  process.exitCode = 2;
} else {
  try {
    const all = [];
    for (const name of files) {
      const input = JSON.parse(await readFile(name, 'utf8'));
      all.push(diagnosePianoBenchmark(input));
    }
    console.log(JSON.stringify({ analyses: all }, null, 2));
  } catch (error) {
    console.error('Microphone failure analysis refused: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
