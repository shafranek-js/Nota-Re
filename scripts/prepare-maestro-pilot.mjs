/** Build one held-out, aligned MAESTRO source clip for the existing two engines.
 * This only runs in the opt-in external-data research workflow. Nothing is
 * committed or persisted except non-audio summary JSON.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { parseMidiOnsets, selectMidiAttacksForAudioClip } from './maestro-midi-onsets.mjs';
import { readPianoWav } from './read-piano-wav.mjs';

function checkedRun(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 90000 });
  if (result.error || result.status !== 0) {
    throw new Error(command + ' failed: ' + (result.error?.message ?? result.stderr?.slice(-900) ?? result.status));
  }
  return result.stdout.trim();
}

/** Inspect synchronized MIDI attacks without inferring audio onset from MIDI Note Off. */
export function chooseReferenceClip(
  attacks, wavDurationMs, desiredDurationMs = 14000
) {
  if (!Array.isArray(attacks) || !Number.isFinite(wavDurationMs) ||
      wavDurationMs < desiredDurationMs + 500 ||
      !Number.isFinite(desiredDurationMs) || desiredDurationMs <= 0) {
    throw new Error('Invalid synchronized recording duration');
  }
  const valid = attacks.filter(x => Number.isInteger(x.midi) &&
    Number.isFinite(x.onsetMs) && x.onsetMs >= 0 && x.onsetMs < wavDurationMs);
  if (!valid.length) throw new Error('No playable MIDI attacks in the source');
  const first = Math.min(...valid.map(x => x.onsetMs));
  const startMs = Math.max(0, Math.min(first - 700, wavDurationMs - desiredDurationMs - 250));
  const expected = selectMidiAttacksForAudioClip(valid, { startMs, durationMs: desiredDurationMs });
  if (expected.length < 2) throw new Error('Pilot clip contains insufficient reference notes');
  return { startMs, durationMs: desiredDurationMs, expected };
}

async function main(path) {
  const root = resolve(path);
  const midiBytes = await readFile(join(root, 'source.mid'));
  const source = JSON.parse(await readFile(join(root, 'source.json'), 'utf8'));
  if (source.dataset !== 'MAESTRO v3.0.0' || source.split !== 'validation') {
    throw new Error('Expected a MAESTRO v3 validation recording');
  }
  const originalWav = join(root, 'source.wav');
  const wavDurationSec = Number(checkedRun('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of',
    'default=noprint_wrappers=1:nokey=1', originalWav
  ]));
  const clip = chooseReferenceClip(parseMidiOnsets(midiBytes), wavDurationSec * 1000);
  const clipped = join(root, 'piano-clip.wav');
  checkedRun('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', originalWav, '-ss', (clip.startMs / 1000).toFixed(6),
    '-t', (clip.durationMs / 1000).toFixed(6),
    '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', clipped
  ]);
  const bytes = await readFile(clipped);
  const decoded = await readPianoWav(clipped);
  if (decoded.sampleRate !== 22050 ||
      Math.abs(decoded.durationSeconds * 1000 - clip.durationMs) > 50) {
    throw new Error('Converted WAV has wrong sample rate or timing');
  }
  const sample = {
    id: 'maestro-v3-validation-pilot',
    category: 'maestro-acoustic-piano',
    wav: './piano-clip.wav',
    audioSha256: createHash('sha256').update(bytes).digest('hex'),
    durationMs: decoded.durationSeconds * 1000,
    expected: clip.expected
  };
  const manifest = { schemaVersion: 1, onsetToleranceMs: 100, cases: [sample] };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const audited = {
    ...source,
    derived_clip: {
      startMs: clip.startMs, durationMs: sample.durationMs,
      targetSampleRate: 22050, mono: true, pcm: 'signed PCM16',
      audioSha256: sample.audioSha256,
      referenceNoteAttacks: clip.expected.length,
      method: 'ffmpeg accurate seek, MIDI PPQ tempo map, first-attack-anchored clip'
    }
  };
  await writeFile(join(root, 'pilot-source-audit.json'), JSON.stringify(audited, null, 2) + '\n');
  console.error(JSON.stringify({
    category: sample.category,
    clipSeconds: sample.durationMs / 1000,
    expectedAttacks: clip.expected.length,
    sha256: sample.audioSha256
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/prepare-maestro-pilot.mjs <download-directory>');
    process.exitCode = 2;
  } else {
    try { await main(process.argv[2]); }
    catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
