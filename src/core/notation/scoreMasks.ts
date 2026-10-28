/** Pure lesson overlay selection based on musical ticks, not note indices per bar. */
export interface TimedExerciseNote {
  readonly durMultiplier: number;
}

export type ScoreMaskMode = 'lookahead' | 'photo' | 'none';
export const TICKS_PER_MEASURE = 16; // 4/4, divisions = 4 (sixteenth notes)

export function getNoteOnsets(notes: readonly TimedExerciseNote[]): number[] {
  let ticks = 0;
  return notes.map(note => {
    const duration = note.durMultiplier * 4;
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new Error('Note durations must be positive sixteenth-note multiples');
    }
    const start = ticks;
    ticks += duration;
    return start;
  });
}

/**
 * Lookahead masks only notes already played. Photo mode masks the real
 * musical measure containing the current note, not an arbitrary four notes.
 * Notes crossing a barline are masked if any part lies in that measure.
 */
export function getMaskedNoteIndices(
  notes: readonly TimedExerciseNote[],
  activeNoteIndex: number,
  mode: ScoreMaskMode,
  isPhotoMasked: boolean
): number[] {
  if (!notes.length || activeNoteIndex < 0 || activeNoteIndex >= notes.length) return [];

  if (mode === 'lookahead') {
    return notes.slice(0, activeNoteIndex).map((_, index) => index);
  }

  if (mode !== 'photo' || !isPhotoMasked) return [];

  const onsets = getNoteOnsets(notes);
  const barStart = Math.floor(onsets[activeNoteIndex] / TICKS_PER_MEASURE) * TICKS_PER_MEASURE;
  const barEnd = barStart + TICKS_PER_MEASURE;
  return notes.flatMap((note, index) => (
    onsets[index] < barEnd && onsets[index] + note.durMultiplier * 4 > barStart ? [index] : []
  ));
}
