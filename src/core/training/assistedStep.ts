import type { ExerciseNote } from '../../types/music';

/**
 * Pure step transition for simulated/tabletop play. Assistance is not MIDI
 * evidence and must never alter the prior state snapshot or count as grading.
 * New array identity is also a cancellation token for the end-of-exercise
 * regeneration timer in useAppStore.
 */
export function advanceAssistedNotes(
  activeExerciseNotes: readonly ExerciseNote[],
  activeNoteIndex: number
): { notes: ExerciseNote[]; nextIndex: number; finished: boolean } | null {
  if (!Number.isInteger(activeNoteIndex) || activeNoteIndex < 0 ||
      activeNoteIndex >= activeExerciseNotes.length) return null;

  const nextIndex = activeNoteIndex + 1;
  const finished = nextIndex >= activeExerciseNotes.length;
  return {
    notes: activeExerciseNotes.map((note, index) =>
      index === activeNoteIndex ? { ...note, status: 'done' as const }
        : index === nextIndex ? { ...note, status: 'current' as const }
          : note
    ),
    nextIndex,
    finished
  };
}
