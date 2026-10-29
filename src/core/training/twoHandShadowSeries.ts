import { COURSE_CURRICULUM } from '../../data/curriculum.ts';
import type { ExerciseScore } from '../notation/musicXml.ts';
import { createLessonTwoHandScore, lessonTwoHandStudyCount } from './lessonTwoHandScore.ts';
import { assessLessonReleases } from './lessonReleaseEvidence.ts';
import { assessPolyphonicPractice } from './polyphonicAssessment.ts';
import type { TempoPlan, TimedPracticeState } from './tempoTwoHand.ts';
import type { TwoHandStep } from './twoHandPractice.ts';
import type { TwoHandTrialLessonId } from './twoHandCourseTrial.ts';
import { getTwoHandCourseTrialPreset } from './twoHandCourseTrial.ts';

/**
 * Candidate training rubric, NOT a course grade.
 *
 * These miniature scores do not cover the literature, finger identity, gaze
 * trajectory, or expressive legato required by the published course lessons.
 * Existing normSpeed (reaction time) is fundamentally incomparable with
 * metronome-based note-on timing and is deliberately NOT used here.
 */
export interface TwoHandShadowPolicy {
  readonly lessonId: TwoHandTrialLessonId;
  readonly requiredCleanStudies: number;
  readonly consecutive: boolean;
  readonly curriculumAccuracyPercent: number;
  readonly curriculumReactionMs: number;
  readonly allowedMeanOnsetDeviationMs: 110;
  readonly provisional: true;
}

export type TrialRejectReason =
  | 'not-finished'
  | 'invalid-score'
  | 'duplicate-study'
  | 'invalid-tempo'
  | 'onset-or-pitch'
  | 'release-or-articulation'
  | 'hardware-interruption';

export interface ShadowAttemptVerdict {
  readonly studyIndex: number;
  readonly accepted: boolean;
  readonly reasons: readonly TrialRejectReason[];
  readonly meanOnsetDeviationMs: number | null;
  readonly noteAccuracyPercent: number;
  readonly acceptedNoteReleases: number;
  readonly expectedNoteReleases: number;
  /** Never represents official completedLessons or normReps credit. */
  readonly officialCourseCredit: false;
}

export function getTwoHandShadowPolicy(
  lessonId: number | null
): TwoHandShadowPolicy | null {
  if (lessonId !== 11 && lessonId !== 12) return null;
  const lesson = COURSE_CURRICULUM.find(item => item.id === lessonId);
  if (!lesson) return null;
  return {
    lessonId,
    requiredCleanStudies: lesson.normReps,
    consecutive: lessonId === 11, // "15 двуручных номеров подряд"
    curriculumAccuracyPercent: lesson.normAcc,
    curriculumReactionMs: lesson.normSpeed,
    allowedMeanOnsetDeviationMs: 110,
    provisional: true
  };
}

function scoreFingerprint(score: ExerciseScore): string {
  return JSON.stringify({
    fifths: score.fifths,
    beats: score.beats,
    beatType: score.beatType,
    divisions: score.divisions,
    notes: score.notes.map(n => [
      n.staff, n.midi, n.onsetTicks, n.durationTicks, n.articulation, n.finger
    ])
  });
}

function stepsFingerprint(steps: readonly TwoHandStep[]): string {
  return JSON.stringify(steps.map(s =>
    [s.onsetTicks, s.durationTicks, [...s.expectedMidi].sort((a, b) => a - b)]
  ));
}

export function evaluateTwoHandShadowAttempt(
  lessonId: TwoHandTrialLessonId,
  score: ExerciseScore,
  steps: readonly TwoHandStep[],
  timed: TimedPracticeState,
  plan: TempoPlan,
  studyIndex = 0
): ShadowAttemptVerdict {
  const policy = getTwoHandShadowPolicy(lessonId);
  const preset = getTwoHandCourseTrialPreset(lessonId);
  if (!policy || !preset) throw new Error('No provisional course trial rubric');
  const validStudyIndex = Number.isSafeInteger(studyIndex) && studyIndex >= 0 &&
    studyIndex < lessonTwoHandStudyCount(lessonId);
  const canonical = validStudyIndex
    ? createLessonTwoHandScore(lessonId, preset.tonality, studyIndex) : null;
  const validScore = !!canonical &&
    scoreFingerprint(score) === scoreFingerprint(canonical.score) &&
    stepsFingerprint(steps) === stepsFingerprint(canonical.steps);
  const validTempo = plan.bpm === preset.bpm &&
    Number.isFinite(plan.startMs) && plan.startMs >= 0 &&
    plan.windowMs > 0 && plan.windowMs <= 160 &&
    plan.overlapMs > 0 && plan.overlapMs <= 140 &&
    plan.holdGraceMs >= 0 && plan.holdGraceMs <= 120;
  // Never evaluate arbitrary untrusted or inconsistent score data using the
  // normal assessor (which rightly throws for malformed onset timelines).
  const attack = validScore
    ? assessPolyphonicPractice(score, steps, timed, policy.allowedMeanOnsetDeviationMs)
    : null;
  const release = validScore ? assessLessonReleases(score, timed) : null;

  const reasons: TrialRejectReason[] = [];
  if (!timed.finished || !attack?.complete) reasons.push('not-finished');
  if (!validScore) reasons.push('invalid-score');
  if (!validTempo) reasons.push('invalid-tempo');
  if (attack && !attack.readyForCourseTrial) reasons.push('onset-or-pitch');
  if (release && !release.validated) reasons.push('release-or-articulation');
  if (timed.interruptions > 0) reasons.push('hardware-interruption');

  return {
    studyIndex,
    accepted: reasons.length === 0,
    reasons,
    meanOnsetDeviationMs: attack?.meanAbsoluteDeviationMs ?? null,
    noteAccuracyPercent: attack ? (
      Math.round(
        1000 * (attack.left.matched + attack.right.matched) /
        (attack.left.expected + attack.right.expected)
      ) / 10
    ) : 0,
    acceptedNoteReleases: release?.observed ?? 0,
    expectedNoteReleases: release?.expected ?? 0,
    officialCourseCredit: false
  };
}

export interface ShadowSeriesState {
  readonly lessonId: TwoHandTrialLessonId | null;
  readonly attempts: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly aborted: number;
  readonly cleanStreak: number;
  /** Unique verified mini-studies still eligible for this practice series. */
  readonly successfulStudies: readonly number[];
  readonly lastAttemptId: number;
  readonly lastVerdict: ShadowAttemptVerdict | null;
  /** Training target only: not formal course completion. */
  readonly practiceTargetReached: boolean;
}

export function initialShadowSeries(
  lessonId: TwoHandTrialLessonId | null
): ShadowSeriesState {
  return {
    lessonId, attempts: 0, accepted: 0, rejected: 0, aborted: 0,
    cleanStreak: 0, successfulStudies: [], lastAttemptId: 0, lastVerdict: null,
    practiceTargetReached: false
  };
}

/**
 * Idempotent attempt ledger; old timers, duplicate React renders or a stale
 * lesson cannot award repeat credit. No persistence or course-store access.
 */
export function appendShadowAttempt(
  state: ShadowSeriesState,
  lessonId: TwoHandTrialLessonId,
  attemptId: number,
  verdict: ShadowAttemptVerdict | null
): ShadowSeriesState {
  if (state.lessonId !== lessonId ||
      !Number.isSafeInteger(attemptId) || attemptId <= state.lastAttemptId) return state;
  const policy = getTwoHandShadowPolicy(lessonId);
  if (!policy) return state;
  const studyIndex = verdict?.studyIndex;
  const validStudyIndex = typeof studyIndex === 'number' &&
    Number.isSafeInteger(studyIndex) && studyIndex >= 0 &&
    studyIndex < lessonTwoHandStudyCount(lessonId);
  const duplicate = validStudyIndex &&
    state.successfulStudies.includes(studyIndex);
  const accepted = verdict?.accepted === true &&
    verdict.officialCourseCredit === false && verdict.reasons.length === 0 &&
    validStudyIndex && !duplicate;
  // A replay of the same score is still practice, but must not be credited
  // as another DISTINCT mini-study, even if MIDI execution was flawless.
  const recordedVerdict = duplicate && verdict?.accepted
    ? { ...verdict, accepted: false as const,
        reasons: ['duplicate-study' as const] }
    : verdict;
  const successfulStudies = accepted
    ? [...state.successfulStudies, studyIndex]
    : policy.consecutive ? [] : state.successfulStudies;
  const cleanStreak = accepted ? state.cleanStreak + 1 : 0;
  return {
    ...state,
    attempts: state.attempts + 1,
    accepted: state.accepted + (accepted ? 1 : 0),
    rejected: state.rejected + (verdict && !accepted ? 1 : 0),
    aborted: state.aborted + (verdict === null ? 1 : 0),
    cleanStreak,
    successfulStudies,
    lastAttemptId: attemptId,
    lastVerdict: recordedVerdict,
    practiceTargetReached: successfulStudies.length >= policy.requiredCleanStudies
  };
}


/**
 * Advances to the first NOT-YET-credited study. On a failed consecutive
 * lesson-11 series this intentionally returns index 0. Null means every
 * distinct preparatory study has been completed; formal course credit still
 * remains disabled.
 */
export function nextTwoHandShadowStudy(
  series: ShadowSeriesState
): number | null {
  if (series.lessonId === null) return null;
  for (let index = 0; index < lessonTwoHandStudyCount(series.lessonId); index++) {
    if (!series.successfulStudies.includes(index)) return index;
  }
  return null;
}
