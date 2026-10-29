/**
 * Pedagogical interval instructions without any engraving coordinates.
 * OSMD supplies the note positions; this model supplies only relationships.
 */
export interface IntervalGuideNote {
  readonly clef: 'treble' | 'bass';
  readonly stepIdx: number;
}
export interface IntervalGuide {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly steps: number;
  readonly symmetric: boolean;
}

export function getIntervalGuides(notes: readonly IntervalGuideNote[]): IntervalGuide[] {
  const result: IntervalGuide[] = [];
  for (let i = 1; i < notes.length; i++) {
    const from = notes[i - 1];
    const to = notes[i];
    // Comparing diatonic staff steps across clefs is misleading.
    if (from.clef !== to.clef) continue;
    if (!Number.isInteger(from.stepIdx) || !Number.isInteger(to.stepIdx)) continue;
    const delta = Math.abs(to.stepIdx - from.stepIdx);
    result.push({
      fromIndex: i - 1,
      toIndex: i,
      steps: delta + 1,
      symmetric: delta % 2 === 0
    });
  }
  return result;
}
