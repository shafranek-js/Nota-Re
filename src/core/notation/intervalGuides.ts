import type { ScoreEvent, WrittenPitch } from './musicXml.ts';
import { spellLegacyMidi } from './legacyScoreAdapter.ts';

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


import type { ScoreEvent, WrittenPitch } from './musicXml.ts';
import { spellLegacyMidi } from './legacyScoreAdapter.ts';

/**
 * Written three-note verticals only. A shared onset on different staves is
 * never a chord; successive notes are never merged by proximity in pixels.
 * "memory" and "graded" are deliberately fail-closed to prevent answer leaks.
 */
export type ChordReadingContext = 'reading' | 'memory' | 'graded';
export type TriadFigure = '5/3' | '6' | '6/4';

export interface VerticalChordGuide {
  readonly onsetTicks: number;
  readonly staff: 1 | 2;
  readonly tonic: string;
  readonly bass: string;
  readonly quality: 'major' | 'minor';
  readonly inversion: 0 | 1 | 2;
  readonly figure: TriadFigure;
  readonly pitchNames: readonly string[];
  readonly explanation: string;
}

const DIATONIC_STEPS: Readonly<Record<WrittenPitch['step'], number>> =
  { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const NATURAL_SEMITONES: Readonly<Record<WrittenPitch['step'], number>> =
  { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

type WrittenNote = WrittenPitch & { readonly midi: number };

function writtenName(pitch: WrittenNote): string {
  return pitch.step + (pitch.alter === 1 ? '♯' : pitch.alter === -1 ? '♭' :
    pitch.alter === 2 ? '𝄪' : pitch.alter === -2 ? '𝄫' : '');
}

function writtenNote(event: ScoreEvent, fifths: number): WrittenNote | null {
  if (!Number.isInteger(event.midi) || event.midi < 0 || event.midi > 127) return null;
  const pitch = event.spelling ?? spellLegacyMidi(event.midi, fifths);
  if (!(pitch.step in DIATONIC_STEPS) ||
      !Number.isInteger(pitch.octave) || !Number.isInteger(pitch.alter) ||
      ![-2, -1, 0, 1, 2].includes(pitch.alter) ||
      (pitch.octave + 1) * 12 + NATURAL_SEMITONES[pitch.step] + pitch.alter !== event.midi) {
    return null;
  }
  return { ...pitch, midi: event.midi };
}

function diatonicPosition(note: WrittenNote): number {
  return note.octave * 7 + DIATONIC_STEPS[note.step];
}

function chordGuide(events: readonly ScoreEvent[], fifths: number): VerticalChordGuide | null {
  if (events.length !== 3) return null;
  const pitches = events.map(event => writtenNote(event, fifths));
  if (pitches.some(pitch => !pitch)) return null;
  const notes = (pitches as WrittenNote[]).sort((a, b) => a.midi - b.midi);
  if (new Set(notes.map(note => note.midi)).size !== 3 ||
      notes[2].midi - notes[0].midi > 12) return null;
  const gap1 = diatonicPosition(notes[1]) - diatonicPosition(notes[0]);
  const gap2 = diatonicPosition(notes[2]) - diatonicPosition(notes[1]);
  const inversion: 0 | 1 | 2 | null =
    gap1 === 2 && gap2 === 2 ? 0 :
    gap1 === 2 && gap2 === 3 ? 1 :
    gap1 === 3 && gap2 === 2 ? 2 : null;
  if (inversion === null) return null;
  const root = notes[[0, 2, 1][inversion]];
  const rootStep = DIATONIC_STEPS[root.step];
  const third = notes.find(note => (DIATONIC_STEPS[note.step] - rootStep + 7) % 7 === 2);
  const fifth = notes.find(note => (DIATONIC_STEPS[note.step] - rootStep + 7) % 7 === 4);
  if (!third || !fifth) return null;
  const thirdSemitones = (third.midi - root.midi + 120) % 12;
  const fifthSemitones = (fifth.midi - root.midi + 120) % 12;
  if (fifthSemitones !== 7 || ![3, 4].includes(thirdSemitones)) return null;

  const figure: TriadFigure = inversion === 0 ? '5/3' : inversion === 1 ? '6' : '6/4';
  const quality = thirdSemitones === 4 ? 'major' : 'minor';
  const bass = writtenName(notes[0]);
  const tonic = writtenName(root);
  const why = inversion === 0
    ? 'В басу основной тон; над ним терция и квинта.'
    : inversion === 1
      ? 'В басу терция трезвучия; над ней терция и секста.'
      : 'В басу квинта трезвучия; над ней кварта и секста.';
  return {
    onsetTicks: events[0].onsetTicks, staff: events[0].staff,
    tonic, bass, quality, inversion, figure,
    pitchNames: notes.map(writtenName),
    explanation: `${why} Фактическое расположение: ${notes.map(writtenName).join('–')}.`
  };
}

export function getVerticalChordGuides(
  events: readonly ScoreEvent[],
  fifths: number,
  context: ChordReadingContext
): VerticalChordGuide[] {
  if (context !== 'reading' || !Number.isInteger(fifths) ||
      fifths < -7 || fifths > 7) return [];
  const groups = new Map<string, ScoreEvent[]>();
  for (const event of events) {
    if (![1, 2].includes(event.staff) || !Number.isSafeInteger(event.onsetTicks) ||
        event.onsetTicks < 0 || !Number.isSafeInteger(event.durationTicks) ||
        event.durationTicks <= 0) continue;
    const key = event.staff + ':' + event.onsetTicks;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => chordGuide(group, fifths))
    .filter((guide): guide is VerticalChordGuide => guide !== null)
    .sort((a, b) => a.onsetTicks - b.onsetTicks || a.staff - b.staff);
}
