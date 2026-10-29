import type { ExerciseScore, StaffNumber } from '../notation/musicXml.ts';
import type { TwoHandStep } from './twoHandPractice.ts';
import type { TimedPracticeState } from './tempoTwoHand.ts';

/**
 * Session-only diagnostic, NOT course certification. Course lessons currently
 * use different sequential targets, repetitions and timing rules; those
 * records must never be incremented from this assessment.
 */
export interface HandAssessment {
  readonly staff: StaffNumber;
  readonly expected: number;
  readonly matched: number;
  readonly accuracyPercent: number;
}

export interface PolyphonicAssessment {
  readonly right: HandAssessment;
  readonly left: HandAssessment;
  readonly totalOnsets: number;
  readonly matchedOnsets: number;
  readonly meanAbsoluteDeviationMs: number | null;
  readonly errors: {
    readonly misses: number;
    readonly wrongPitches: number;
    readonly offBeatNotes: number;
    readonly earlyReleases: number;
    readonly overheldNotes: number;
    readonly interruptions: number;
  };
  /** Verified MIDI timeline has ended, with no inconsistent attack evidence. */
  readonly complete: boolean;
  /** No missed or extra notes, disconnected MIDI, or incorrect durations. */
  readonly clean: boolean;
  /** Experimental readiness criterion, not a passing course grade. */
  readonly readyForCourseTrial: boolean;
  readonly recommendations: readonly string[];
}

/**
 * The optional threshold is for a practice-readiness diagnostic only.
 * All required attacks must still be correct and played without mistakes;
 * an 80% accuracy result does NOT count as a clean repetition.
 */
export function assessPolyphonicPractice(
  score: ExerciseScore,
  steps: readonly TwoHandStep[],
  state: TimedPracticeState,
  maxMeanDeviationMs = 110
): PolyphonicAssessment {
  if (!Number.isFinite(maxMeanDeviationMs) || maxMeanDeviationMs < 0 ||
      steps.length === 0 || score.notes.length === 0) {
    throw new Error('Invalid two-hand readiness assessment');
  }
  const expectedOnsets = steps.map(step => step.onsetTicks);
  const allDistinct = expectedOnsets.every((tick, index) =>
    Number.isSafeInteger(tick) &&
    (index === 0 || tick > expectedOnsets[index - 1]));
  if (!allDistinct) throw new Error('Invalid two-hand onset timeline');

  const matched = new Set(state.hitOnsets);
  const expectedKeys = new Set(score.notes.map(note => note.onsetTicks + ':' + note.midi));
  const attackKeys = new Set(state.acceptedAttacks.map(note => note.onsetTicks + ':' + note.midi));
  const evidenceConsistent =
    state.hits === state.hitOnsets.length &&
    matched.size === state.hitOnsets.length &&
    state.onsetDeviationsMs.length === state.hitOnsets.length &&
    state.hitOnsets.every(tick => expectedOnsets.includes(tick)) &&
    state.onsetDeviationsMs.every(n => Number.isFinite(n) && n >= 0) &&
    attackKeys.size === state.acceptedAttacks.length &&
    state.acceptedAttacks.every(note =>
      expectedKeys.has(note.onsetTicks + ':' + note.midi) &&
      Number.isFinite(note.atMs)) &&
    // A full-chord hit must be backed by every note's actual MIDI event.
    state.hitOnsets.every(tick =>
      score.notes.filter(note => note.onsetTicks === tick)
        .every(note => attackKeys.has(note.onsetTicks + ':' + note.midi))) &&
    state.hits + state.misses === steps.length;

  const hand = (staff: StaffNumber): HandAssessment => {
    const notes = score.notes.filter(note => note.staff === staff);
    const matchedCount = notes.filter(note => attackKeys.has(note.onsetTicks + ':' + note.midi)).length;
    return {
      staff, expected: notes.length, matched: matchedCount,
      accuracyPercent: notes.length ? Math.round(matchedCount / notes.length * 1000) / 10 : 0
    };
  };
  const right = hand(1);
  const left = hand(2);
  const meanAbsoluteDeviationMs = state.onsetDeviationsMs.length
    ? Math.round(state.onsetDeviationsMs.reduce((a, b) => a + b, 0) /
        state.onsetDeviationsMs.length)
    : null;
  const errors = {
    misses: state.misses,
    wrongPitches: state.wrongPitches,
    offBeatNotes: state.offBeatNotes,
    earlyReleases: state.earlyReleases,
    overheldNotes: state.overheldNotes,
    interruptions: state.interruptions
  };

  const complete = state.finished && state.stepIndex === steps.length &&
    evidenceConsistent && right.expected > 0 && left.expected > 0;
  const clean = complete && state.hitOnsets.length === steps.length &&
    right.matched === right.expected && left.matched === left.expected &&
    Object.values(errors).every(value => value === 0);
  const readyForCourseTrial = clean && meanAbsoluteDeviationMs !== null &&
    meanAbsoluteDeviationMs <= maxMeanDeviationMs;

  const recommendations: string[] = [];
  if (!complete) recommendations.push('Завершите полную попытку с метрономом и MIDI.');
  if (right.accuracyPercent < 100) recommendations.push('Отработайте вступления правой руки.');
  if (left.accuracyPercent < 100) recommendations.push('Отработайте вступления левой руки.');
  if (errors.earlyReleases > 0 || errors.overheldNotes > 0) {
    recommendations.push('Следите за длительностью: физическое отпускание должно совпадать с нотами.');
  }
  if (errors.wrongPitches || errors.offBeatNotes) {
    recommendations.push('Уберите ошибочные и внеплановые MIDI-нажатия.');
  }
  if (errors.interruptions) {
    recommendations.push('Повторите попытку без отключения MIDI-устройства.');
  }
  if (meanAbsoluteDeviationMs !== null &&
      meanAbsoluteDeviationMs > maxMeanDeviationMs) {
    recommendations.push('Улучшите ритм: уменьшите среднее отклонение атак от метронома.');
  }
  if (readyForCourseTrial) {
    recommendations.push('Чистая попытка: можно переходить к пробным двухручным заданиям курса.');
  }

  return {
    right, left, totalOnsets: steps.length, matchedOnsets: state.hitOnsets.length,
    meanAbsoluteDeviationMs, errors, complete, clean, readyForCourseTrial,
    recommendations
  };
}
