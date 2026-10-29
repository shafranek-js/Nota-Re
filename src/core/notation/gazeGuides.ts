/**
 * "Letter Г" eye path: start with the bass anchor on the downbeat,
 * then shift the gaze upward and to the right to the first treble note.
 * This is a *reading instruction*, not evidence of polyphonic playing.
 *
 * Detect actual musical 4/4 downbeats rather than every fourth item:
 * variable note lengths must not place gaze guides in the wrong bar.
 */
import { getNoteOnsets, TICKS_PER_MEASURE } from './scoreMasks';

export interface GPatternNote {
  readonly clef: 'treble' | 'bass';
  readonly durMultiplier: number;
}

export interface GazeGuide {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly measure: number;
}

export function getGazeGuides(notes: readonly GPatternNote[]): GazeGuide[] {
  if (notes.length < 2) return [];
  const onsets = getNoteOnsets(notes);
  const guides: GazeGuide[] = [];
  for (let i = 0; i < notes.length - 1; i++) {
    if (notes[i].clef !== 'bass' || onsets[i] % TICKS_PER_MEASURE !== 0) continue;
    const barEnd = onsets[i] + TICKS_PER_MEASURE;
    // The first treble note after the bass downbeat in this very measure.
    const toIndex = notes.findIndex((note, index) =>
      index > i && onsets[index] < barEnd && note.clef === 'treble'
    );
    if (toIndex < 0) continue;
    guides.push({ fromIndex: i, toIndex, measure: onsets[i] / TICKS_PER_MEASURE + 1 });
  }
  return guides;
}
