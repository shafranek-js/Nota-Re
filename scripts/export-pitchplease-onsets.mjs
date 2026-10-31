/** Offline benchmark only; no microphone, certificate, UI or course scoring integration. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readPianoWav } from './read-piano-wav.mjs';
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

    const cases = [];
    for (const item of manifest.cases) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() ||
          typeof item.category !== 'string' || !item.category.trim() ||
          typeof item.wav !== 'string' || !item.wav.trim() ||
          !Array.isArray(item.expected)) {
        throw new Error('Invalid corpus case metadata');
      }
      const filename = resolve(dirname(file), item.wav);
      const { samples, sampleRate } = await readPianoWav(filename);
      const frames = await packageApi.analyze(samples, sampleRate, { model: 'piano' });
      const detected = activationFramesToOnsets(frames);
      cases.push({ id: item.id, category: item.category, expected: item.expected, detected });
      console.error(`Analyzed ${item.id}: ${frames.length} frames, ${detected.length} estimated attacks`);
    }

    // The exact model revision is recorded. Offline analyze() is not live,
    // so emittedAtMs is deliberately absent: real-time latency is unknown.
    const dataset = {
      schemaVersion: 1,
      engine: `pitchplease@3.1.0:piano:${model.revision}:activation-frame-r0`,
      onsetToleranceMs: manifest.onsetToleranceMs,
      cases
    };
    evaluatePianoBenchmark(dataset); // validates exported events
    console.log(JSON.stringify(dataset, null, 2));
  } catch (error) {
    console.error('Cannot export PitchPlease baseline: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
