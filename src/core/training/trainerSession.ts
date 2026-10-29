import type { ExerciseNote } from '../../types/music';

/**
 * Phase is separate from the rhythmic "continuous flow" switch.
 * Precheck and count-in will become explicit phases in follow-up PRs;
 * they are not simulated with arbitrary delays in this iteration.
 */
export type TrainerPhase = 'setup' | 'playing' | 'results';

/** Retry the exact displayed exercise, keeping its notes and music. */
export function resetNotesForRetry(notes: readonly ExerciseNote[]): ExerciseNote[] {
  return notes.map((note, index) => ({
    ...note,
    status: index === 0 ? 'current' as const : 'pending' as const
  }));
}
