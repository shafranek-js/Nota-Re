import type { ExerciseNote } from '../../types/music';

/**
 * Phase is separate from the rhythmic "continuous flow" switch.
 * Precheck is optional; count-in exists only for explicit rhythmic starts.\n * They are separate from the musical flow timing and from graded results.
 */
export type TrainerPhase = 'setup' | 'precheck' | 'countIn' | 'playing' | 'results';

/** Retry the exact displayed exercise, keeping its notes and music. */
export function resetNotesForRetry(notes: readonly ExerciseNote[]): ExerciseNote[] {
  return notes.map((note, index) => ({
    ...note,
    status: index === 0 ? 'current' as const : 'pending' as const
  }));
}
