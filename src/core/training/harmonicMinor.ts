import type { SupportedKey, WrittenPitch } from '../notation/musicXml.ts';
import { parseSpelledPitch } from './directedInterval.ts';
import type { ChordInversion } from './chordStudy.ts';

type Triad = readonly [string, string, string];
interface Dominant {
  readonly tonic: string;
  /** Explicitly not included in the relative minor key signature. */
  readonly leadingTone: string;
  readonly left: Triad;
  readonly right: readonly [Triad, Triad, Triad];
}

/**
 * In minor, the major dominant V takes the raised scale degree 7.
 * A minor E–G#–B; E minor B–D#–F#; D minor A–C#–E;
 * B minor F#–A#–C#. Accidentals belong to NOTEs, not a modified key signature.
 */
const DOMINANTS: Readonly<Record<SupportedKey, Dominant>> = {
  C: {
    tonic: 'A', leadingTone: 'G#', left: ['E3','G#3','B3'],
    right: [
      ['E4','G#4','B4'], ['G#4','B4','E5'], ['B4','E5','G#5']
    ]
  },
  G: {
    tonic: 'E', leadingTone: 'D#', left: ['B2','D#3','F#3'],
    right: [
      ['B4','D#5','F#5'], ['D#4','F#4','B4'], ['F#4','B4','D#5']
    ]
  },
  F: {
    tonic: 'D', leadingTone: 'C#', left: ['A2','C#3','E3'],
    right: [
      ['A4','C#5','E5'], ['C#4','E4','A4'], ['E4','A4','C#5']
    ]
  },
  D: {
    tonic: 'B', leadingTone: 'A#', left: ['F#2','A#2','C#3'],
    right: [
      ['F#4','A#4','C#5'], ['A#4','C#5','F#5'], ['C#4','F#4','A#4']
    ]
  }
};

export function harmonicMinorDominant(key: SupportedKey, inversion: ChordInversion): {
  readonly tonic: string;
  readonly leadingTone: string;
  readonly left: Triad;
  readonly right: Triad;
} {
  if (!(key in DOMINANTS) || ![0,1,2].includes(inversion)) {
    throw new Error('Unsupported harmonic minor key/inversion.');
  }
  const entry = DOMINANTS[key];
  return {
    tonic: entry.tonic,
    leadingTone: entry.leadingTone,
    left: entry.left,
    right: entry.right[inversion]
  };
}

/** Parse an explicit staff spelling and verify that its sound is valid. */
export function writtenPitchFromName(name: string): { midi: number; spelling: WrittenPitch } {
  const parsed = parseSpelledPitch(name);
  const match = /^([A-G])([#b]?)([0-8])$/.exec(name);
  if (!parsed || !match) throw new Error('Unsupported written pitch: ' + name);
  return {
    midi: parsed.midi,
    spelling: {
      step: match[1] as WrittenPitch['step'],
      alter: match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0,
      octave: Number(match[3])
    }
  };
}
