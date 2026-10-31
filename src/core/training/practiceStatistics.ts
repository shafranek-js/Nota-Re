import type { AppMode, ClefType } from '../../types/music';
import type { AttemptEvent } from './exerciseAttempt.ts';

export type PracticeSource = 'pc' | 'midi';
export interface PracticeStat {
  readonly observations: number;
  readonly correct: number;
  readonly wrong: number;
  readonly late: number;
  readonly missed: number;
  /** Lifetime mistakes are never erased; only the active weighting boost can reset. */
  readonly activeErrors: number;
  readonly cleanStreak: number;
  readonly reactionSamples: number;
  readonly reactionSumMs: number;
  readonly reactionEmaMs: number | null;
  readonly lastAt: number;
}
export interface PracticeStats {
  readonly version: 1;
  readonly notes: Readonly<Record<string, PracticeStat>>;
  readonly intervals: Readonly<Record<string, PracticeStat>>;
}
export interface PracticeObservation {
  readonly source: PracticeSource;
  readonly mode: AppMode;
  readonly noteName: string;
  readonly clef: ClefType;
  readonly outcome: 'correct' | 'wrong-pitch' | 'late' | 'missed';
  readonly reactionMs: number | null;
  readonly at: number;
  readonly previousNoteName?: string;
  readonly previousClef?: ClefType;
}
export interface PracticeNoteIdentity {
  readonly noteName: string;
  readonly clef: ClefType;
}
const MAX_ITEMS = 512;
const MAX_COUNT = 1000000;
const MAX_REACTION = 60000;
const MAX_AT = 8640000000000000;
const modeSet = new Set<AppMode>(['reflex', 'rhythm', 'lookahead', 'photo', 'intervals', 'gpattern', 'blind', 'hanon']);
const notesPattern = /^[A-G](?:#|b)?[0-8]$/;

export function emptyPracticeStats(): PracticeStats {
  return { version: 1, notes: {}, intervals: {} };
}
export function noteStatisticsKey(source: PracticeSource, mode: AppMode, note: PracticeNoteIdentity): string {
  return [source, mode, note.clef, note.noteName].join(':');
}
export function intervalStatisticsKey(source: PracticeSource, mode: AppMode,
  previous: PracticeNoteIdentity, current: PracticeNoteIdentity): string {
  return [source, mode, previous.clef, previous.noteName, 'to', current.clef, current.noteName].join(':');
}
const newStat = (): PracticeStat => ({
  observations: 0, correct: 0, wrong: 0, late: 0, missed: 0,
  activeErrors: 0, cleanStreak: 0, reactionSamples: 0,
  reactionSumMs: 0, reactionEmaMs: null, lastAt: 0
});
function validObservation(o: PracticeObservation): boolean {
  return !!o && (o.source === 'pc' || o.source === 'midi') && modeSet.has(o.mode) &&
    (o.clef === 'treble' || o.clef === 'bass') && notesPattern.test(o.noteName) &&
    ['correct', 'wrong-pitch', 'late', 'missed'].includes(o.outcome) &&
    Number.isSafeInteger(o.at) && o.at >= 0 && o.at <= MAX_AT &&
    (o.reactionMs === null || Number.isFinite(o.reactionMs) &&
      o.reactionMs >= 0 && o.reactionMs <= MAX_REACTION);
}
function observe(old: PracticeStat, o: PracticeObservation): PracticeStat {
  const clean = o.outcome === 'correct' && o.reactionMs !== null && o.reactionMs < 500;
  const nextStreak = clean ? Math.min(5, old.cleanStreak + 1) : 0;
  const validResponse = o.outcome === 'correct' && o.reactionMs !== null;
  const sampleCount = validResponse ? Math.min(MAX_COUNT, old.reactionSamples + 1) : old.reactionSamples;
  const sum = validResponse
    ? Math.min(MAX_COUNT * MAX_REACTION, old.reactionSumMs + o.reactionMs!) : old.reactionSumMs;
  const bad = o.outcome !== 'correct';
  return {
    observations: Math.min(MAX_COUNT, old.observations + 1),
    correct: Math.min(MAX_COUNT, old.correct + Number(o.outcome === 'correct')),
    wrong: Math.min(MAX_COUNT, old.wrong + Number(o.outcome === 'wrong-pitch')),
    late: Math.min(MAX_COUNT, old.late + Number(o.outcome === 'late')),
    missed: Math.min(MAX_COUNT, old.missed + Number(o.outcome === 'missed')),
    activeErrors: nextStreak === 5 ? 0 :
      Math.min(30, old.activeErrors + Number(bad)),
    cleanStreak: nextStreak,
    reactionSamples: sampleCount,
    reactionSumMs: sum,
    reactionEmaMs: validResponse
      ? old.reactionEmaMs === null ? o.reactionMs :
        0.25 * o.reactionMs! + 0.75 * old.reactionEmaMs
      : old.reactionEmaMs,
    lastAt: Math.max(old.lastAt, o.at)
  };
}
export function addPracticeObservation(stats: PracticeStats, o: PracticeObservation): PracticeStats {
  if (!validObservation(o)) return stats;
  const key = noteStatisticsKey(o.source, o.mode, { noteName: o.noteName, clef: o.clef });
  const notes = { ...stats.notes };
  // Oldest data is discarded when full; no unbounded browser storage.
  if (!(key in notes) && Object.keys(notes).length >= MAX_ITEMS) {
    const oldest = Object.entries(notes).sort((a, b) => a[1].lastAt - b[1].lastAt)[0]?.[0];
    if (oldest) delete notes[oldest];
  }
  notes[key] = observe(notes[key] ?? newStat(), o);
  const intervals = { ...stats.intervals };
  if (o.previousNoteName && o.previousClef &&
      notesPattern.test(o.previousNoteName) && ['treble', 'bass'].includes(o.previousClef)) {
    const pairKey = intervalStatisticsKey(o.source, o.mode,
      { noteName: o.previousNoteName, clef: o.previousClef },
      { noteName: o.noteName, clef: o.clef });
    if (!(pairKey in intervals) && Object.keys(intervals).length >= MAX_ITEMS) {
      const oldest = Object.entries(intervals).sort((a, b) => a[1].lastAt - b[1].lastAt)[0]?.[0];
      if (oldest) delete intervals[oldest];
    }
    intervals[pairKey] = observe(intervals[pairKey] ?? newStat(), o);
  }
  return { version: 1, notes, intervals };
}

/**
 * Only explicitly tagged standalone self-paced input is eligible.
 * Historic score snapshots lack source provenance, so don't invent it.
 * A failed keypress and later correct keypress each remain distinct observations.
 */
export function addSelfPacedReflexAttempt(
  stats: PracticeStats,
  events: readonly AttemptEvent[],
  score: readonly PracticeNoteIdentity[],
  nowMs: number
): PracticeStats {
  let next = stats;
  for (const event of events) {
    if (event.source !== 'midi' && event.source !== 'pc') continue;
    if (!Number.isInteger(event.noteIndex) || event.noteIndex < 0 ||
        event.noteIndex >= score.length) continue;
    const note = score[event.noteIndex];
    const prev = event.noteIndex > 0 ? score[event.noteIndex - 1] : null;
    if (!note || note.noteName !== event.expectedNote ||
        event.outcome === 'assisted') continue;
    next = addPracticeObservation(next, {
      source: event.source, mode: 'reflex', noteName: note.noteName, clef: note.clef,
      outcome: event.outcome, reactionMs: event.outcome === 'correct' ? event.reactionMs : null,
      at: nowMs,
      ...(prev ? { previousNoteName: prev.noteName, previousClef: prev.clef } : {})
    });
  }
  return next;
}

export function validatePracticeStats(value: unknown): PracticeStats {
  if (!value || typeof value !== 'object') return emptyPracticeStats();
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return emptyPracticeStats();
  const read = (input: unknown): Record<string, PracticeStat> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const entries = Object.entries(input);
    if (entries.length > MAX_ITEMS) return {};
    const result: Record<string, PracticeStat> = Object.create(null);
    for (const [key, v] of entries) {
      if (key.length > 140 || !/^(pc|midi):[a-z]+:(treble|bass):/.test(key) ||
          !v || typeof v !== 'object') continue;
      const s = v as Record<string, unknown>;
      const ints = ['observations', 'correct', 'wrong', 'late', 'missed',
        'activeErrors', 'cleanStreak', 'reactionSamples', 'lastAt'];
      if (!ints.every(k => Number.isSafeInteger(s[k]) && (s[k] as number) >= 0 &&
          (s[k] as number) <= (k === 'lastAt' ? MAX_AT : MAX_COUNT)) ||
          typeof s.reactionSumMs !== 'number' || !Number.isFinite(s.reactionSumMs) ||
          s.reactionSumMs < 0 || s.reactionSumMs > MAX_COUNT * MAX_REACTION ||
          !(s.reactionEmaMs === null || typeof s.reactionEmaMs === 'number' &&
            Number.isFinite(s.reactionEmaMs) && s.reactionEmaMs >= 0 &&
            s.reactionEmaMs <= MAX_REACTION) ||
          (s.cleanStreak as number) > 5 || (s.activeErrors as number) > 30) continue;
      result[key] = s as unknown as PracticeStat;
    }
    return result;
  };
  return { version: 1, notes: read(obj.notes), intervals: read(obj.intervals) };
}
