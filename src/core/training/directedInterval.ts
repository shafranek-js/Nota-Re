import type { PracticeNoteIdentity } from './practiceStatistics.ts';

/** Music spelling is semantic: C4→Db4 and C4→C#4 are not the same interval. */
export interface DirectedInterval {
  readonly diatonicSteps: number;
  readonly chromaticSemitones: number;
}

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const SEMITONES: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
};

export function parseSpelledPitch(noteName: string):
  { readonly diatonic: number; readonly midi: number } | null {
  const match = /^([A-G])([#b]?)([0-8])$/.exec(noteName);
  if (!match) return null;
  const step = STEPS.indexOf(match[1] as (typeof STEPS)[number]);
  const octave = Number(match[3]);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const midi = 12 * (octave + 1) + SEMITONES[match[1]] + accidental;
  return Number.isSafeInteger(midi) && midi >= 0 && midi <= 127
    ? { diatonic: octave * 7 + step, midi } : null;
}

export function directedInterval(previous: PracticeNoteIdentity,
  current: PracticeNoteIdentity): DirectedInterval | null {
  const from = parseSpelledPitch(previous.noteName);
  const to = parseSpelledPitch(current.noteName);
  if (!from || !to) return null;
  return {
    diatonicSteps: to.diatonic - from.diatonic,
    chromaticSemitones: to.midi - from.midi
  };
}

export function directedIntervalLabel(interval: DirectedInterval): string {
  const sign = (value: number) => value >= 0 ? '+' + value : String(value);
  return `ступени ${sign(interval.diatonicSteps)}, полутоны ${sign(interval.chromaticSemitones)}`;
}
