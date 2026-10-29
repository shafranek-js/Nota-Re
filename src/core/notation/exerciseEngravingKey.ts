import type { ExerciseNote } from '../../types/music';

/**
 * MusicXML changes only if actual musical content changes. UI status
 * (pending/current/done/missed), active index and last played note are NOT
 * engraving inputs. Zustand must publish immutable note snapshots without
 * causing OSMD to reload the entire score for each successful attack.
 */
export function getExerciseEngravingKey(notes: readonly ExerciseNote[]): string {
  return JSON.stringify(notes.map(note => [
    note.midi, note.clef, note.durMultiplier,
    note.finger, note.articulation, note.syllable
  ]));
}
