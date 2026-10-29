import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { applyTonalityToPitch } from '../generator/ExerciseGenerator.ts';
import {
  createScoreFromTimedHands, type ExerciseScore, type SupportedKey,
  type TimedHandPitch
} from '../notation/musicXml.ts';
import type { TwoHandPracticeScore, TwoHandStep } from './twoHandPractice.ts';
import type { TwoHandTrialLessonId } from './twoHandCourseTrial.ts';

/**
 * Two complete 4/4 measures, explicitly notated for BOTH hands. These are
 * deterministic short preparatory studies, not the full lessons' literature.
 * The formal course norm remains independent of the MIDI study.
 */
export function createLessonTwoHandScore(
  lessonId: TwoHandTrialLessonId, tonality: SupportedKey
): TwoHandPracticeScore {
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
    // Gaze trajectory: bass on beat one; RH melody on beats two–four.
    // The second bar repeats with new pitches and a different bass.
    right = ['C4', 'D4', 'E4', 'F4', 'G4', 'E4']
      .map((pitch, i) => note(pitch, [4, 8, 12, 20, 24, 28][i], 4, 'legato'));
    left = [note('C3', 0, 4, 'legato'), note('G3', 16, 4, 'legato')];
  } else if (lessonId === 12) {
    // RH legato eighth-notes, LH staccato quarter-notes. Written note
    // duration and physical key hold duration deliberately differ for
    // staccato: the remaining time is silent within the note's beat.
    const rh = ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4'];
    const lh = ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3'];
    right = Array.from({ length: 16 }, (_, i) =>
      note(rh[i % rh.length], i * 2, 2, 'legato'));
    left = lh.map((pitch, i) => note(pitch, i * 4, 4, 'staccato'));
  } else {
    throw new Error('Unsupported two-hand course study');
  }

  const score = createScoreFromTimedHands(
    right, left, tonality, 'Nota-Re lesson ' + lessonId + ' — two-hand study'
  );
  const steps = createTwoHandSteps(score);
  return { score, steps };
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
