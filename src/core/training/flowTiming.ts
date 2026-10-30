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

/**
 * Integer quarter-beat boundaries within a note. Short eighth/sixteenth
 * notes do not generate extra ticks; half notes include intermediate beats.
 * Offsets are relative to this note's onset; scores currently use 4/4.
 */
export function metronomeBeatsInNote(
  notes: readonly FlowNote[], index: number
): ReadonlyArray<{ offsetQuarters: number; strong: boolean }> {
  if (index < 0 || index >= notes.length) return [];
  const start = notes.slice(0, index).reduce((sum, n) => sum + n.durMultiplier, 0);
  const duration = notes[index].durMultiplier;
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const end = start + duration;
  const result: Array<{ offsetQuarters: number; strong: boolean }> = [];
  for (let beat = Math.ceil(start - 1e-8); beat < end - 1e-8; beat++) {
    if (beat < 0) continue;
    result.push({ offsetQuarters: Math.max(0, beat - start), strong: beat % 4 === 0 });
  }
  return result;
}

/** True when this note starts on a measure boundary of 4 quarter beats. */
export function startsMeasure(notes: readonly FlowNote[], index: number): boolean {
  if (index < 0 || index >= notes.length) return false;
  const beats = notes.slice(0, index).reduce((sum, note) => sum + note.durMultiplier, 0);
  return Math.abs(beats / 4 - Math.round(beats / 4)) < 1e-8;
}

export interface LessonEvidence {
  /** Count complete, independently played exercise scores, not perfect scores. */
  readonly completedExercises: number;
  readonly judgedNotes: number;
  readonly correctNotes: number;
  readonly reactionTotalMs: number;
  readonly reactionSamples: number;
}

export const EMPTY_LESSON_EVIDENCE: LessonEvidence = Object.freeze({
  completedExercises: 0, judgedNotes: 0, correctNotes: 0,
  reactionTotalMs: 0, reactionSamples: 0
});

export interface LessonCredit {
  readonly previous: LessonEvidence;
  readonly noteCount: number;
  readonly events: readonly import('./exerciseAttempt').AttemptEvent[];
  readonly assisted: boolean;
  readonly targetRepetitions: number;
  readonly requiredAccuracy: number;
  readonly maximumReactionMs: number;
  readonly lessonActive: boolean;
}

/**
 * A lesson is evaluated across completed exercise scores. A wrong strike,
 * correction or rhythmic miss lowers series accuracy; it does not erase the
 * earlier work. Each expected note must have an actual grading event.
 * Assisted exercises cannot increase the series or fabricate timing evidence.
 */
export function evaluateLessonCredit(input: LessonCredit): {
  evidence: LessonEvidence;
  credited: boolean;
  creditedRepetitions: number;
  accuracy: number | null;
  averageReactionMs: number | null;
  passed: boolean;
} {
  const graded = input.events.filter(event => event.outcome !== 'assisted');
  const coveredNotes = new Set(graded.map(event => event.noteIndex));
  const complete = input.noteCount > 0 &&
    coveredNotes.size === input.noteCount &&
    graded.every(event => Number.isInteger(event.noteIndex) &&
      event.noteIndex >= 0 && event.noteIndex < input.noteCount);
  const credited = input.lessonActive && !input.assisted && complete &&
    !input.events.some(event => event.outcome === 'assisted');
  const correct = graded.filter(event => event.outcome === 'correct');
  const validReactions = correct.map(event => event.reactionMs).filter(
    (value): value is number => value !== null && Number.isFinite(value) && value >= 0
  );
  const evidence: LessonEvidence = credited ? {
    completedExercises: input.previous.completedExercises + 1,
    judgedNotes: input.previous.judgedNotes + graded.length,
    correctNotes: input.previous.correctNotes + correct.length,
    reactionTotalMs: input.previous.reactionTotalMs +
      validReactions.reduce((sum, value) => sum + value, 0),
    reactionSamples: input.previous.reactionSamples + validReactions.length
  } : input.previous;
  const accuracy = evidence.judgedNotes > 0
    ? 100 * evidence.correctNotes / evidence.judgedNotes : null;
  const averageReactionMs = evidence.reactionSamples > 0
    ? evidence.reactionTotalMs / evidence.reactionSamples : null;
  const passed = credited &&
    evidence.completedExercises >= input.targetRepetitions &&
    accuracy !== null && accuracy >= input.requiredAccuracy &&
    averageReactionMs !== null && averageReactionMs <= input.maximumReactionMs &&
    // A missing/invalid time for a supposedly correct note is not proof of speed.
    evidence.reactionSamples === evidence.correctNotes &&
    evidence.correctNotes > 0;
  return {
    evidence, credited, creditedRepetitions: evidence.completedExercises,
    accuracy, averageReactionMs, passed
  };
}
