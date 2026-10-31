/** Prepare one independently annotated WAV/MIDI corpus case, without uploading recordings. */
import { readFile } from 'node:fs/promises';
import { parseMidiOnsets, selectMidiAttacksForAudioClip } from './maestro-midi-onsets.mjs';
import { readPianoWav } from './read-piano-wav.mjs';

const [, , midiPath, wavPath, startArg, durationArg, id, category] = process.argv;
if (process.argv.length !== 8) {
  console.error('Usage: node scripts/create-piano-reference-case.mjs <aligned.mid> <clip.wav> <clip-start-ms> <clip-duration-ms> <id> <category>');
  process.exitCode = 2;
} else {
  try {
    const startMs = Number(startArg);
    const durationMs = Number(durationArg);
    if (!Number.isFinite(startMs) || startMs < 0 ||
        !Number.isFinite(durationMs) || durationMs <= 0 ||
        typeof id !== 'string' || !id.trim() ||
        typeof category !== 'string' || !category.trim()) {
      throw new Error('Invalid clip timing or case metadata');
    }
    const [midiData, wav] = await Promise.all([
      readFile(midiPath), readPianoWav(wavPath)
    ]);
    const actualDuration = wav.durationSeconds * 1000;
    if (Math.abs(actualDuration - durationMs) > 100) {
      throw new Error(
        `WAV clip duration ${actualDuration.toFixed(1)} ms differs from requested ${durationMs} ms`
      );
    }
    const expected = selectMidiAttacksForAudioClip(
      parseMidiOnsets(midiData), { startMs, durationMs }
    );
    // The WAV path is preserved as provided, relative to the eventual manifest.
    // The script never guesses missing audio/MIDI synchronization offsets.
    console.log(JSON.stringify({ id, category, wav: wavPath, expected }, null, 2));
    console.error(`Reference: ${expected.length} physical MIDI note attacks; time origin = WAV clip start`);
  } catch (error) {
    console.error('Cannot construct piano reference case: ' +
      (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
