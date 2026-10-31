/** Prepare independent aligned MAESTRO validation clips, never audio artifacts. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseMidiReference } from './maestro-midi-onsets.mjs';
import { chooseReferenceClip } from './prepare-maestro-pilot.mjs';
import { readPianoWav } from './read-piano-wav.mjs';

function exec(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 90000 });
  if (result.error || result.status !== 0) {
    throw new Error(command + ' failed: ' + (result.error?.message ?? result.stderr?.slice(-900) ?? result.status));
  }
  return result.stdout.trim();
}

export function validateIndependentSources(sources) {
  if (!Array.isArray(sources) || sources.length < 3) {
    throw new Error('At least three distinct source performances are required');
  }
  const ids = new Set(), audios = new Set(), composers = new Set(), compositions = new Set();
  for (const source of sources) {
    if (!source || source.dataset !== 'MAESTRO v3.0.0' || source.split !== 'validation' ||
        typeof source.id !== 'string' || !/^maestro-validation-\d{2}$/.test(source.id) ||
        typeof source.composer !== 'string' || !source.composer.trim() ||
        typeof source.title !== 'string' || !source.title.trim() ||
        typeof source.audio_filename !== 'string' || !source.audio_filename.trim() ||
        typeof source.source_audio?.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(source.source_audio.sha256)) {
      throw new Error('Invalid MAESTRO validation provenance');
    }
    const composition = JSON.stringify([source.composer, source.title]);
    if (ids.has(source.id) || audios.has(source.source_audio.sha256) ||
        composers.has(source.composer) || compositions.has(composition)) {
      throw new Error('Corpus contains reused performance, source WAV or composer');
    }
    ids.add(source.id); audios.add(source.source_audio.sha256);
    composers.add(source.composer); compositions.add(composition);
  }
}

async function main(dir) {
  const root = resolve(dir);
  const download = JSON.parse(await readFile(join(root, 'download-audit.json'), 'utf8'));
  if (download.dataset !== 'MAESTRO v3.0.0' || download.split !== 'validation') {
    throw new Error('Only MAESTRO v3 validation recordings are permitted');
  }
  validateIndependentSources(download.cases);
  const cases = [];
  const audits = [];
  for (const source of download.cases) {
    const folder = join(root, 'takes', source.id);
    const wav = join(folder, 'source.wav');
    const midi = join(folder, 'source.mid');
    const original = await readFile(wav);
    const digest = createHash('sha256').update(original).digest('hex');
    if (digest !== source.source_audio.sha256) {
      throw new Error('Downloaded source WAV hash mismatch: ' + source.id);
    }
    const sourceMidi = await readFile(midi);
    if (createHash('sha256').update(sourceMidi).digest('hex') !== source.source_midi.sha256) {
      throw new Error('Downloaded source MIDI hash mismatch: ' + source.id);
    }
    const durationMs = Number(exec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', wav
    ])) * 1000;
    const midiReference = parseMidiReference(sourceMidi);
    const clip = chooseReferenceClip(midiReference.attacks, durationMs);
    const clipped = join(folder, 'piano-clip.wav');
    exec('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', wav, '-ss', (clip.startMs / 1000).toFixed(6),
      '-t', (clip.durationMs / 1000).toFixed(6),
      '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', clipped
    ]);
    const { durationSeconds, sampleRate } = await readPianoWav(clipped);
    if (sampleRate !== 22050 || Math.abs(durationSeconds * 1000 - clip.durationMs) > 50) {
      throw new Error('Bad converted WAV timing/rate: ' + source.id);
    }
    const convertedSha256 = createHash('sha256').update(await readFile(clipped)).digest('hex');
    cases.push({
      id: source.id, category: 'maestro-acoustic-piano',
      wav: './takes/' + source.id + '/piano-clip.wav',
      audioSha256: convertedSha256,
      durationMs: durationSeconds * 1000,
      expected: clip.expected
    });
    audits.push({
      ...source,
      derived_clip: {
        startMs: clip.startMs, durationMs: durationSeconds * 1000,
        audioSha256: convertedSha256, referenceNoteAttacks: clip.expected.length,
        pedalCc64EventsInSource: midiReference.pedalChanges.length,
        pedalAnnotatedAttacks: clip.expected.filter(x => x.pedalDownAtOnset !== null).length,
        pedalDownAtAttackCount: clip.expected.filter(x => x.pedalDownAtOnset === true).length,
        pedalUnknownAtAttackCount: clip.expected.filter(x => x.pedalDownAtOnset === null).length,
        targetSampleRate: 22050, mono: true, pcm: 'signed PCM16',
        method: 'ffmpeg accurate seek; MIDI PPQ tempo map; first-attack anchored'
      }
    });
    console.error(source.id + ': ' + clip.expected.length + ' reference note attacks');
  }
  const manifest = { schemaVersion: 1, onsetToleranceMs: 100, cases };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(root, 'corpus-source-audit.json'), JSON.stringify({
    dataset: download.dataset, license: download.license, split: download.split,
    selection: download.selection, upstream_metadata: download.upstream_metadata,
    cases: audits
  }, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/prepare-maestro-corpus.mjs <download-directory>');
    process.exitCode = 2;
  } else {
    try { await main(process.argv[2]); }
    catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
