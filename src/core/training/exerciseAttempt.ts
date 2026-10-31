import type { AppMode, TonalityKey } from '../../types/music';

/**
 * These records describe one score attempt, not the accumulated lesson/session
 * statistics. Assisted (imagined) steps have no pitch or timing evidence.
 */
export type AttemptOutcome = 'correct' | 'wrong-pitch' | 'late' | 'missed' | 'assisted';

export interface AttemptEvent {
  readonly noteIndex: number;
  readonly expectedNote: string;
  readonly playedNote: string | null;
  /** Proven input path for new observations; historic events have no known source. */
  readonly source?: 'midi' | 'pc';
  readonly outcome: AttemptOutcome;
  readonly reactionMs: number | null;
}

export interface AttemptSnapshot {
  readonly mode: AppMode;
  readonly tonality: TonalityKey;
  readonly bpm: number;
  readonly lessonId: number | null;
  readonly noteCount: number;
  readonly events: readonly AttemptEvent[];
  /** A physical/PC graded answer or missed rhythmic slot; never assisted steps. */
  readonly judgedEvents: number;
  readonly correctHits: number;
  readonly wrongPitches: number;
  readonly lateHits: number;
  readonly missedSlots: number;
  readonly assistedSteps: number;
  /** null means no graded inputs (rather than a misleading 0%). */
  readonly accuracyPercent: number | null;
  /** Only valid correct answers supply reaction samples. */
  readonly averageReactionMs: number | null;
  /** Independent and complete score, even when some notes were incorrect. */
  readonly creditEligible: boolean;
  /** Actual lesson-credit evaluation, not inferred from attempt percentages. */
  readonly lessonPassed: boolean;
}

export interface AttemptSnapshotInput {
  readonly mode: AppMode;
  readonly tonality: TonalityKey;
  readonly bpm: number;
  readonly lessonId: number | null;
  readonly noteCount: number;
  readonly events: readonly AttemptEvent[];
  readonly clean: boolean;
  readonly assisted: boolean;
  readonly lessonPassed: boolean;
}

/** Detach a finished exercise from mutable score and session state. */
export function createAttemptSnapshot(input: AttemptSnapshotInput): AttemptSnapshot {
  const events = input.events.map(event => Object.freeze({ ...event }));
  const count = (kind: AttemptOutcome): number =>
    events.filter(event => event.outcome === kind).length;
  const correctHits = count('correct');
  const wrongPitches = count('wrong-pitch');
  const lateHits = count('late');
  const missedSlots = count('missed');
  const assistedSteps = count('assisted');
  const judgedEvents = correctHits + wrongPitches + lateHits + missedSlots;
  const reactionTimes = events
    .filter(event => event.outcome === 'correct' &&
      event.reactionMs !== null && Number.isFinite(event.reactionMs) && event.reactionMs >= 0)
    .map(event => event.reactionMs as number);
  const averageReactionMs = reactionTimes.length
    ? reactionTimes.reduce((sum, value) => sum + value, 0) / reactionTimes.length
    : null;
  return Object.freeze({
    mode: input.mode,
    tonality: input.tonality,
    bpm: input.bpm,
    lessonId: input.lessonId,
    noteCount: input.noteCount,
    events: Object.freeze(events),
    judgedEvents,
    correctHits,
    wrongPitches,
    lateHits,
    missedSlots,
    assistedSteps,
    accuracyPercent: judgedEvents ? (100 * correctHits / judgedEvents) : null,
    averageReactionMs,
    creditEligible: input.lessonId !== null && !input.assisted && assistedSteps === 0 &&
      input.noteCount > 0 && new Set(events.filter(event => event.outcome !== 'assisted')
        .map(event => event.noteIndex)).size === input.noteCount &&
      events.every(event => Number.isInteger(event.noteIndex) &&
        event.noteIndex >= 0 && event.noteIndex < input.noteCount),
    lessonPassed: input.lessonPassed && input.lessonId !== null && !input.assisted && assistedSteps === 0
  });
}
