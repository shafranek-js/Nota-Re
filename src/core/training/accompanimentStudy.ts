import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { createScoreFromTimedHands, type SupportedKey, type TimedHandPitch } from '../notation/musicXml.ts';
import { parseSpelledPitch } from './directedInterval.ts';
import { createChordStudy, type ChordInversion, type ChordQuality } from './chordStudy.ts';
import { createTwoHandSteps } from './lessonTwoHandScore.ts';
import type { TwoHandPracticeScore } from './twoHandPractice.ts';

export type AccompanimentTexture = 'alberti' | 'waltz' | 'arpeggio';
export type AccompanimentHands = 'left' | 'both';

export interface AccompanimentStudy extends TwoHandPracticeScore {
  readonly texture: AccompanimentTexture;
  readonly hands: AccompanimentHands;
  readonly bassOctaveShift: 0 | 12;
  readonly beats: 3 | 4;
  readonly tonicName: string;
  readonly quality: ChordQuality;
  readonly inversion: ChordInversion;
  readonly rightNotes: readonly string[];
  readonly leftNotes: readonly [string, string, string];
  readonly description: string;
}

/** Left hand is in a real bass register; never copy RH notes down one staff. */
const LEFT_TRIADS: Readonly<Record<SupportedKey, Readonly<Record<ChordQuality,
  readonly [string, string, string]>>>> = {
  C: { major: ['C3', 'E3', 'G3'], minor: ['A2', 'C3', 'E3'] },
  G: { major: ['G2', 'B2', 'D3'], minor: ['E3', 'G3', 'B3'] },
  F: { major: ['F2', 'A2', 'C3'], minor: ['D3', 'F3', 'A3'] },
  D: { major: ['D3', 'F#3', 'A3'], minor: ['B2', 'D3', 'F#3'] }
};

export const ACCOMPANIMENT_DESCRIPTIONS: Readonly<Record<AccompanimentTexture, string>> = {
  alberti: 'Бас Альберти: нижний — верхний — средний — верхний, ровные восьмые, размер 4/4.',
  waltz: 'Вальс: бас на первую долю, аккорд на вторую и третью, настоящий размер 3/4.',
  arpeggio: 'Ломаное арпеджио: нижний — средний — верхний — средний, ровные восьмые, размер 4/4.'
};

function note(name: string, onsetTicks: number, durationTicks: number,
  articulation: 'legato' | 'staccato' = 'legato'): TimedHandPitch {
  const parsed = parseSpelledPitch(name);
  if (!parsed || parsed.midi < 36 || parsed.midi > 84) {
    throw new Error('Unsupported accompaniment pitch ' + name);
  }
  return { midi: parsed.midi, onsetTicks, durationTicks, articulation };
}

/**
 * Two complete bars. A free mode accepts note-on pitch evidence only;
 * the separate timed mode verifies rhythm, independent RH/LH onsets and
 * physical releases via the existing polyphonic MIDI reducer.
 *
 * "left" explicitly provides a 25-key-friendly practice stage, while
 * "both" uses the actual lower and upper piano registers, which a
 * short keyboard cannot cover simultaneously.
 */
export function createAccompanimentStudy(
  key: SupportedKey,
  quality: ChordQuality,
  inversion: ChordInversion,
  texture: AccompanimentTexture,
  hands: AccompanimentHands = 'both',
  bassOctaveShift: 0 | 12 = 0
): AccompanimentStudy {
  if (!['alberti', 'waltz', 'arpeggio'].includes(texture) ||
      !['left', 'both'].includes(hands) || ![0, 12].includes(bassOctaveShift) ||
      (hands === 'both' && bassOctaveShift !== 0)) {
    throw new Error('Unsupported accompaniment texture/hands/transposition.');
  }
  const harmony = createChordStudy(key, quality, inversion);
  const original = LEFT_TRIADS[key]?.[quality];
  if (!original) throw new Error('Unsupported accompaniment key.');
  const leftNotes = original.map(name => {
    if (bassOctaveShift === 0) return name;
    return name.replace(/[0-8]$/, octave => String(Number(octave) + 1));
  }) as unknown as [string, string, string];
  const rightNotes = harmony.pitchNames;
  const beats: 3 | 4 = texture === 'waltz' ? 3 : 4;
  const measureTicks = beats * 4;
  const left: TimedHandPitch[] = [];
  const right: TimedHandPitch[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const origin = bar * measureTicks;
    if (hands === 'both') {
      // RH plays a complete inverted triad on the downbeat, holding it for
      // the entire bar. It has an independent musical clock from the bass.
      for (const name of rightNotes) {
        const expected = MIDI_NOTE_MAP[name];
        if (!expected || expected.clef !== 'treble') throw new Error('Invalid RH chord pitch.');
        right.push(note(name, origin, measureTicks));
      }
    }
    if (texture === 'waltz') {
      left.push(note(leftNotes[0], origin, 4, 'legato'));
      for (const offset of [4, 8]) {
        // Bass + TWO upper chord tones is a standard light 3/4 accompaniment.
        // The bass does not sustain through beats 2 and 3.
        left.push(note(leftNotes[1], origin + offset, 4, 'staccato'));
        left.push(note(leftNotes[2], origin + offset, 4, 'staccato'));
      }
    } else {
      const indexes = texture === 'alberti'
        ? [0, 2, 1, 2, 0, 2, 1, 2]
        : [0, 1, 2, 1, 0, 1, 2, 1];
      for (let i = 0; i < indexes.length; i++) {
        left.push(note(leftNotes[indexes[i]], origin + i * 2, 2));
      }
    }
  }
  const score = {
    ...createScoreFromTimedHands(
      right, left, key,
      `Nota-Re — ${harmony.tonicName} ${quality}, ${texture}, ${hands}`, beats
    ),
    mode: quality
  };
  return {
    texture, hands, bassOctaveShift, beats, score, steps: createTwoHandSteps(score),
    tonicName: harmony.tonicName, quality, inversion,
    rightNotes, leftNotes,
    description: ACCOMPANIMENT_DESCRIPTIONS[texture]
  };
}
