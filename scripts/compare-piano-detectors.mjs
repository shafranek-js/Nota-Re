/** Read model-export JSONs and refuse invalid side-by-side comparisons. */
import { readFile } from 'node:fs/promises';
import { comparePianoDetectors } from '../src/core/audio/microphoneComparison.ts';

const filenames = process.argv.slice(2);
if (filenames.length < 2 || filenames.includes('--help')) {
  console.error('Usage: node --experimental-strip-types scripts/compare-piano-detectors.mjs <detector-a.json> <detector-b.json> [more.json]');
  console.error('All files must have the same audioSha256, durationMs, reference notes and onset tolerance per case.');
  process.exitCode = 2;
} else {
  try {
    const datasets = await Promise.all(filenames.map(async filename =>
      JSON.parse(await readFile(filename, 'utf8'))));
    console.log(JSON.stringify(comparePianoDetectors(datasets), null, 2));
  } catch (error) {
    console.error('Detector comparison rejected: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
