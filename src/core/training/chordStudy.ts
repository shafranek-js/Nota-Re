import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { createScoreFromTimedHands, type SupportedKey, type TimedHandPitch } from '../notation/musicXml.ts';
import { createTwoHandSteps } from './lessonTwoHandScore.ts';
import type { TwoHandPracticeScore } from './twoHandPractice.ts';

export type ChordQuality = 'major' | 'minor';
export type ChordInversion = 0 | 1 | 2;

export interface ChordStudy extends TwoHandPracticeScore {
  readonly tonicName: string;
  readonly quality: ChordQuality;
  readonly inversion: ChordInversion;
  readonly pitchNames: readonly [string, string, string];
  readonly inversionName: string;
}

/**
 * Explicit one-hand closed-voicing reading examples.
 * The minor tonic is the RELATIVE minor of the selected key signature;
 * we don't mistake tonic minor for the parallel major's signature.
 * Pitch spelling is deliberate; no MIDI->enharmonic guess determines theory.
 */
const VOICINGS: Readonly<Record<SupportedKey, Readonly<Record<ChordQuality, {
  readonly tonic: string;
  readonly inversions: readonly [
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string]
  ];
}>>>> = {
  C: {
    major: { tonic: 'C', inversions: [
      ['C4', 'E4', 'G4'], ['E4', 'G4', 'C5'], ['G4', 'C5', 'E5']
    ] },
    minor: { tonic: 'A', inversions: [
      ['A4', 'C5', 'E5'], ['C4', 'E4', 'A4'], ['E4', 'A4', 'C5']
    ] }
  },
  G: {
    major: { tonic: 'G', inversions: [
      ['G4', 'B4', 'D5'], ['B4', 'D5', 'G5'], ['D4', 'G4', 'B4']
    ] },
    minor: { tonic: 'E', inversions: [
      ['E4', 'G4', 'B4'], ['G4', 'B4', 'E5'], ['B4', 'E5', 'G5']
    ] }
  },
  F: {
    major: { tonic: 'F', inversions: [
      ['F4', 'A4', 'C5'], ['A4', 'C5', 'F5'], ['C5', 'F5', 'A5']
    ] },
    minor: { tonic: 'D', inversions: [
      ['D4', 'F4', 'A4'], ['F4', 'A4', 'D5'], ['A4', 'D5', 'F5']
    ] }
  },
  D: {
    major: { tonic: 'D', inversions: [
      ['D4', 'F#4', 'A4'], ['F#4', 'A4', 'D5'], ['A4', 'D5', 'F#5']
    ] },
    minor: { tonic: 'B', inversions: [
      ['B4', 'D5', 'F#5'], ['D4', 'F#4', 'B4'], ['F#4', 'B4', 'D5']
    ] }
  }
};

const inversionName: Readonly<Record<ChordInversion, string>> = {
  0: 'Основной вид (5/3)',
  1: 'Первое обращение (6)',
  2: 'Второе обращение (6/4)'
};

export function createChordStudy(
  tonality: SupportedKey,
  quality: ChordQuality = 'major',
  inversion: ChordInversion = 0
): ChordStudy {
  if (!['C', 'G', 'F', 'D'].includes(tonality) ||
      (quality !== 'major' && quality !== 'minor') ||
      !Number.isInteger(inversion) || inversion < 0 || inversion > 2) {
    throw new Error('Unsupported chord key, mode or inversion.');
  }
  const preset = VOICINGS[tonality][quality];
  const pitchNames = preset.inversions[inversion];
  const midi = pitchNames.map(name => {
    const def = MIDI_NOTE_MAP[name];
    if (!def || def.clef !== 'treble') throw new Error('Unsupported treble chord pitch: ' + name);
    return def.midi;
  });
  if (!(midi[0] < midi[1] && midi[1] < midi[2]) ||
      new Set(midi.map(n => n % 12)).size !== 3 ||
      midi[2] - midi[0] > 12) {
    throw new Error('Invalid closed-position triad.');
  }

  // Four independent quarter-note CHORD attacks in a 4/4 bar.
  // One hand only: the empty LH staff must never be treated as a missed part.
  const right: TimedHandPitch[] = Array.from({ length: 4 }, (_, repetition) =>
    midi.map(note => ({
      midi: note, onsetTicks: repetition * 4, durationTicks: 4,
      articulation: 'legato' as const
    }))
  ).flat();
  const inversionLabel = inversionName[inversion];
  const score = {
    ...createScoreFromTimedHands(
      right, [], tonality,
      `Nota-Re — ${preset.tonic} ${quality} triad — ${inversionLabel}`
    ),
    mode: quality
  };
  return {
    score, steps: createTwoHandSteps(score),
    tonicName: preset.tonic, quality, inversion, pitchNames, inversionName: inversionLabel
  };
}
