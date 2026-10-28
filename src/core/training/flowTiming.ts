/**
 * A quarter note is one beat at BPM. Exercise durations use 1=quarter,
 * 0.5=eighth, 0.25=sixteenth and 2=half. Each flow deadline is tied to
 * the duration of the *current* note, not one constant interval per note.
 */
export interface FlowNote { readonly durMultiplier: number }

export function noteDurationMs(note: FlowNote, bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('BPM must be positive');
  if (!Number.isFinite(note.durMultiplier) || note.durMultiplier <= 0) {
    throw new Error('Flow note duration must be positive');
  }
  return Math.max(1, Math.round(60000 * note.durMultiplier / bpm));
}

/**
 * Absolute clock deadlines do not drift when a JavaScript wake-up is late.
 * Callers should carry the previous deadline forward to the next note onset.
 */
export function nextAudioDeadline(startAudioTime: number, note: FlowNote, bpm: number): number {
  if (!Number.isFinite(startAudioTime) || startAudioTime < 0) throw new Error('Invalid audio time');
  return startAudioTime + noteDurationMs(note, bpm) / 1000;
}

export function remainingAudioMs(nowAudioTime: number, deadlineAudioTime: number): number {
  if (!Number.isFinite(nowAudioTime) || !Number.isFinite(deadlineAudioTime)) {
    throw new Error('Invalid audio clock');
  }
  return Math.max(0, Math.round((deadlineAudioTime - nowAudioTime) * 1000));
}

/** True when this note starts on a measure boundary of 4 quarter beats. */
export function startsMeasure(notes: readonly FlowNote[], index: number): boolean {
  if (index < 0 || index >= notes.length) return false;
  const beats = notes.slice(0, index).reduce((sum, note) => sum + note.durMultiplier, 0);
  return Math.abs(beats / 4 - Math.round(beats / 4)) < 1e-8;
}

export interface LessonCredit {
  readonly clean: boolean;
  readonly assisted: boolean;
  readonly completedBefore: number;
  readonly targetRepetitions: number;
  readonly totalAttempts: number;
  readonly correctHits: number;
  readonly reactionTimes: readonly number[];
  readonly requiredAccuracy: number;
  readonly maximumReactionMs: number;
  readonly lessonActive: boolean;
}

/**
 * A repetition is creditable only if every note was played independently
 * without misses or wrong pitches. Automatic lesson passing additionally
 * requires real timing samples and the actual preset lesson to be active.
 */
export function evaluateLessonCredit(input: LessonCredit): {
  creditedRepetitions: number;
  accuracy: number;
  averageReactionMs: number | null;
  passed: boolean;
} {
  const creditedRepetitions = input.clean && !input.assisted ? input.completedBefore + 1 : 0;
  const accuracy = input.totalAttempts > 0
    ? 100 * input.correctHits / input.totalAttempts : 0;
  const recent = input.reactionTimes.slice(-15);
  const averageReactionMs = recent.length
    ? recent.reduce((sum, rt) => sum + rt, 0) / recent.length : null;
  const passed = input.lessonActive &&
    creditedRepetitions >= input.targetRepetitions &&
    input.totalAttempts > 0 &&
    accuracy >= input.requiredAccuracy &&
    averageReactionMs !== null &&
    averageReactionMs <= input.maximumReactionMs;
  return { creditedRepetitions, accuracy, averageReactionMs, passed };
}
