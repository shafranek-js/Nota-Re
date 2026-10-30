import type { FlowNote } from './flowTiming';
import { noteDurationMs } from './flowTiming.ts';

/**
 * Lesson 3 trains reading and playing to the musical onset, not just pressing
 * any key before the next note. In a continuous flow an answer belongs to the
 * current note slot; there is no rewinding or retroactive credit.
 *
 * The intentionally generous one-sided beginner tolerance is 20% of the
 * note's actual duration, capped at 200 ms. E.g. quarter at 60 BPM: 200 ms;
 * eighth at 60 BPM: 100 ms. An early strike before a queued onset must be
 * ignored by the caller, not counted as an on-time note.
 */
export function lessonThreeOnsetToleranceMs(note: FlowNote, bpm: number): number {
  return Math.min(200, Math.max(1, Math.round(noteDurationMs(note, bpm) * 0.20)));
}

/** Exceeding the onset window, even within the musical note, is late. */
export function isLessonThreeLateOnset(
  note: FlowNote, bpm: number, elapsedSinceOnsetMs: number
): boolean {
  return !Number.isFinite(elapsedSinceOnsetMs) ||
    elapsedSinceOnsetMs > lessonThreeOnsetToleranceMs(note, bpm);
}

export interface RhythmOutcomeCounts {
  readonly correct: number;
  readonly wrongPitch: number;
  readonly late: number;
  readonly missed: number;
}

/** Same evidence as the result card and course credits; never infer missing
 * events from notes, and do not count assisted steps as errors. */
export function countRhythmOutcomes(
  events: readonly { readonly outcome: string }[]
): RhythmOutcomeCounts {
  return {
    correct: events.filter(event => event.outcome === 'correct').length,
    wrongPitch: events.filter(event => event.outcome === 'wrong-pitch').length,
    late: events.filter(event => event.outcome === 'late').length,
    missed: events.filter(event => event.outcome === 'missed').length
  };
}
