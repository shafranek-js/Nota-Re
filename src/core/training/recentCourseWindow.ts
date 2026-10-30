import type { AppMode } from '../../types/music';
import type { AttemptEvent } from './exerciseAttempt';
import type { LessonEvidence } from './flowTiming';

/**
 * Compact evidence per COMPLETE, unassisted, graded score. No raw MIDI notes,
 * identifiers or per-key timestamps are persisted. Old v1 aggregates remain
 * separate as lifetime history and can NEVER be split into invented attempts.
 */
export interface GradedScore {
  readonly mode: AppMode;
  readonly judgedNotes: number;
  readonly correctNotes: number;
  readonly reactionSamples: number;
  readonly reactionTotalMs: number;
}
export type RecentCourseWindows = Partial<Record<number, readonly GradedScore[]>>;

export function gradedScoreFromEvents(mode: AppMode, events: readonly AttemptEvent[]): GradedScore {
  const judged = events.filter(e => e.outcome !== 'assisted');
  const correct = judged.filter(e => e.outcome === 'correct');
  const reactions = correct.map(e => e.reactionMs).filter(
    (v): v is number => v !== null && Number.isFinite(v) && v >= 0
  );
  return {
    mode, judgedNotes: judged.length, correctNotes: correct.length,
    reactionSamples: reactions.length,
    reactionTotalMs: reactions.reduce((sum, ms) => sum + ms, 0)
  };
}

/** Lesson 10 is a two-stage assessment, not fifteen interchangeable notes.
 * Keep 7 most recent Lookahead scores, then 8 most recent Photo scores;
 * replacing old Photo attempts must not silently delete the Lookahead stage.
 */
export function appendCourseWindow(
  existing: readonly GradedScore[], next: GradedScore, lessonId: number, target: number
): readonly GradedScore[] {
  if (lessonId === 10) {
    const lookahead = existing.filter(e => e.mode === 'lookahead');
    const photo = existing.filter(e => e.mode === 'photo');
    if (next.mode === 'lookahead' && lookahead.length < 7 && photo.length === 0) {
      return [...lookahead, next];
    }
    if (next.mode === 'photo' && lookahead.length >= 7) {
      return [...lookahead.slice(-7), ...photo.slice(-7), next];
    }
    return existing;
  }
  return [...existing, next].slice(-target);
}

export function lessonTenLookaheadCount(window: readonly GradedScore[]): number {
  return Math.min(7, window.filter(e => e.mode === 'lookahead').length);
}

export function evaluateCourseWindow(
  window: readonly GradedScore[], lessonId: number, target: number, requiredAccuracy: number
): { readonly count: number; readonly accuracy: number | null;
     readonly averageReactionMs: number | null; readonly passed: boolean;
     readonly stageValid: boolean } {
  const count = window.length;
  const judged = window.reduce((sum, item) => sum + item.judgedNotes, 0);
  const correct = window.reduce((sum, item) => sum + item.correctNotes, 0);
  const samples = window.reduce((sum, item) => sum + item.reactionSamples, 0);
  const time = window.reduce((sum, item) => sum + item.reactionTotalMs, 0);
  const stageValid = lessonId !== 10 || (
    window.filter(e => e.mode === 'lookahead').length === 7 &&
    window.filter(e => e.mode === 'photo').length === 8 &&
    window.slice(0, 7).every(e => e.mode === 'lookahead') &&
    window.slice(7).every(e => e.mode === 'photo'));
  const accuracy = judged > 0 ? 100 * correct / judged : null;
  return {
    count, accuracy, averageReactionMs: samples > 0 ? time / samples : null,
    stageValid,
    passed: count >= target && stageValid && accuracy !== null && accuracy >= requiredAccuracy
  };
}

/** Compatibility for lesson 1 only: its previously valid 10+ / >=90% series
 * was already approved by the released policy; keep that earned achievement.
 * This is NOT proof of the last N attempts and is never applied to lesson 2+.
 */
export function qualifiesLegacyLessonOne(
  priorWindow: readonly GradedScore[], lifetime: LessonEvidence, target: number, accuracy: number
): boolean {
  return priorWindow.length === 0 && lifetime.completedExercises >= target &&
    lifetime.judgedNotes > 0 && 100 * lifetime.correctNotes / lifetime.judgedNotes >= accuracy;
}
