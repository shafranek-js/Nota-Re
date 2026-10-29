import { MIDI_NOTE_MAP } from '../../data/notes.ts';

/**
 * Scoring is physical pitch identity (MIDI 0–127), never the enharmonic
 * spelling used on an OSMD staff or a QWERTY/physical keyboard.
 * The notation name is retained separately for user-facing diagnostics.
 */
export function judgeExerciseNote(
  expectedMidi: number,
  playedName: string,
  late: boolean
): 'correct' | 'late' | 'wrong-pitch' {
  const played = MIDI_NOTE_MAP[playedName];
  if (!played || played.midi !== expectedMidi) return 'wrong-pitch';
  return late ? 'late' : 'correct';
}
