import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { applyTonalityToPitch } from '../generator/ExerciseGenerator.ts';
import {
  createScoreFromTimedHands, type ExerciseScore, type SupportedKey,
  type TimedHandPitch
} from '../notation/musicXml.ts';
import type { TwoHandPracticeScore, TwoHandStep } from './twoHandPractice.ts';
import type { TwoHandTrialLessonId } from './twoHandCourseTrial.ts';

/**
 * Original two-bar preparatory mini-studies. Variants are fully deterministic:
 * a failed/aborted exercise can be replayed without silently changing notes.
 * Still NOT the source repertoire required for formal curriculum credit.
 */
const MELODIES_11 = [
  ['C4', 'D4', 'E4', 'F4', 'G4', 'E4'],
  ['D4', 'E4', 'F4', 'G4', 'E4', 'D4'],
  ['E4', 'G4', 'F4', 'D4', 'C4', 'E4'],
  ['G4', 'F4', 'E4', 'D4', 'E4', 'C4'],
  ['C4', 'E4', 'G4', 'F4', 'D4', 'C4']
] as const;

const RH_RHYTHMS_11 = [
  { offsets: [4, 8, 12], durations: [4, 4, 4] },
  { offsets: [4, 6, 12], durations: [2, 6, 4] },
  { offsets: [4, 10, 12], durations: [6, 2, 4] },
  { offsets: [4, 8, 10], durations: [4, 2, 6] },
  { offsets: [4, 7, 10], durations: [3, 3, 6] }
] as const;

const BASSES_11 = [
  ['C3', 'G3'],
  ['F3', 'C3'],
  ['G3', 'D3']
] as const;

const MELODIES_12 = [
  ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4'],
  ['D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4'],
  ['E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4', 'D4'],
  ['G4', 'F4', 'E4', 'D4', 'C4', 'D4', 'E4', 'F4'],
  ['C4', 'E4', 'D4', 'F4', 'E4', 'G4', 'F4', 'D4']
] as const;

const BASSES_12 = [
  ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3'],
  ['G3', 'F3', 'E3', 'D3', 'C3', 'D3', 'E3', 'F3'],
  ['C3', 'E3', 'G3', 'E3', 'C3', 'E3', 'G3', 'E3'],
  ['F3', 'E3', 'D3', 'C3', 'D3', 'E3', 'F3', 'G3']
] as const;

export function lessonTwoHandStudyCount(lessonId: TwoHandTrialLessonId): number {
  if (lessonId === 11) return MELODIES_11.length * BASSES_11.length;
  if (lessonId === 12) return MELODIES_12.length * BASSES_12.length;
  throw new Error('Unsupported two-hand lesson');
}

/** An index is a canonical study ID, not a random generator seed. */
export function createLessonTwoHandScore(
  lessonId: TwoHandTrialLessonId, tonality: SupportedKey, studyIndex = 0
): TwoHandPracticeScore {
  const count = lessonTwoHandStudyCount(lessonId);
  if (!Number.isSafeInteger(studyIndex) || studyIndex < 0 || studyIndex >= count) {
    throw new Error('Invalid two-hand study index');
  }

  const note = (
    name: string, onsetTicks: number, durationTicks: number,
    articulation: 'legato' | 'staccato'
  ): TimedHandPitch => {
    const pitch = MIDI_NOTE_MAP[applyTonalityToPitch(name, tonality)];
    if (!pitch) throw new Error('Unknown lesson pitch: ' + name);
    return {
      midi: pitch.midi, onsetTicks, durationTicks,
      articulation, finger: pitch.finger
    };
  };

  let right: TimedHandPitch[];
  let left: TimedHandPitch[];
  if (lessonId === 11) {
    // Every original study maintains the "Г" reading trajectory:
    // bass on beat one, the RH enters on beat two, then reads toward
    // the next measure. Melodies, baselines and RH rhythms vary.
    const rhIndex = studyIndex % MELODIES_11.length;
    const lhIndex = Math.floor(studyIndex / MELODIES_11.length);
    const melody = MELODIES_11[rhIndex];
    const rhythm = RH_RHYTHMS_11[rhIndex];
    right = melody.map((pitch, i) => note(
      pitch, (i >= 3 ? 16 : 0) + rhythm.offsets[i % 3],
      rhythm.durations[i % 3], 'legato'
    ));
    left = BASSES_11[lhIndex].map((pitch, bar) =>
      note(pitch, bar * 16, 4, 'legato'));
  } else if (lessonId === 12) {
    // Independent 4-note RH blocks over LH detached quarter notes.
    // Written notes do not prove actual 4th/5th-finger usage.
    const rhIndex = studyIndex % MELODIES_12.length;
    const lhIndex = Math.floor(studyIndex / MELODIES_12.length);
    const melody = MELODIES_12[rhIndex];
    const bass = BASSES_12[lhIndex];
    right = Array.from({ length: 16 }, (_, i) =>
      note(melody[i % melody.length], i * 2, 2, 'legato'));
    left = bass.map((pitch, i) => note(pitch, i * 4, 4, 'staccato'));
  } else {
    throw new Error('Unsupported two-hand course study');
  }

  const score = createScoreFromTimedHands(
    right, left, tonality,
    'Nota-Re lesson ' + lessonId + ' — study ' + (studyIndex + 1) + '/' + count
  );
  return { score, steps: createTwoHandSteps(score) };
}

/** A single pitch cannot substitute for two voices at the same onset. */
export function createTwoHandSteps(score: ExerciseScore): readonly TwoHandStep[] {
  if (!score.notes.length) throw new Error('Empty lesson score');
  const byOnset = new Map<number, number[]>();
  for (const n of score.notes) {
    const pitches = byOnset.get(n.onsetTicks) ?? [];
    if (pitches.includes(n.midi)) {
      throw new Error('Ambiguous simultaneous pitch across staves');
    }
    pitches.push(n.midi);
    byOnset.set(n.onsetTicks, pitches);
  }
  const endTicks = Math.max(...score.notes.map(n => n.onsetTicks + n.durationTicks));
  const onsets = [...byOnset.keys()].sort((a, b) => a - b);
  return onsets.map((onsetTicks, i) => ({
    onsetTicks,
    expectedMidi: [...(byOnset.get(onsetTicks) ?? [])].sort((a, b) => a - b),
    durationTicks: (onsets[i + 1] ?? endTicks) - onsetTicks
  }));
}
