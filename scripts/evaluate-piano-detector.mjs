import { readFile } from 'node:fs/promises';
import { evaluatePianoBenchmark } from '../src/core/audio/microphoneBenchmark.ts';

if (process.argv.length !== 3) {
  console.error('Usage: node --experimental-strip-types scripts/evaluate-piano-detector.mjs <events.json>');
  process.exitCode = 2;
} else {
  try {
    const dataset = JSON.parse(await readFile(process.argv[2], 'utf8'));
    console.log(JSON.stringify(evaluatePianoBenchmark(dataset), null, 2));
  } catch (error) {
    console.error('Piano benchmark failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
