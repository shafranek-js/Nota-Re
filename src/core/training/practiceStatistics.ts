import type { AppMode, ClefType } from '../../types/music';
import type { AttemptEvent } from './exerciseAttempt.ts';
import { directedInterval } from './directedInterval.ts';

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
  readonly version: 2;
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
  return { version: 2, notes: {}, intervals: {} };
}
export function noteStatisticsKey(source: PracticeSource, mode: AppMode, note: PracticeNoteIdentity): string {
  return [source, mode, note.clef, note.noteName].join(':');
}
export function intervalStatisticsKey(source: PracticeSource, mode: AppMode,
  previous: PracticeNoteIdentity, current: PracticeNoteIdentity): string {
  const interval = directedInterval(previous, current);
  if (!interval) throw new Error('Invalid or unsupported spelled interval');
  const signed = (value: number) => value >= 0 ? '+' + value : String(value);
  return [source, mode, previous.clef, previous.noteName, 'to',
    current.clef, current.noteName, 'd' + signed(interval.diatonicSteps),
    'c' + signed(interval.chromaticSemitones)].join(':');
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
  return { version: 2, notes, intervals: stats.intervals };
}

/** Add a target-to-target transition ONLY when the caller proves adjacency. */
export function addPracticeIntervalObservation(
  stats: PracticeStats, o: PracticeObservation
): PracticeStats {
  if (!validObservation(o) || !o.previousNoteName ||
      !o.previousClef || !notesPattern.test(o.previousNoteName) ||
      !['treble', 'bass'].includes(o.previousClef)) return stats;
  const previous = { noteName: o.previousNoteName, clef: o.previousClef };
  const current = { noteName: o.noteName, clef: o.clef };
  if (!directedInterval(previous, current)) return stats;
  const key = intervalStatisticsKey(o.source, o.mode, previous, current);
  const intervals = { ...stats.intervals };
  if (!(key in intervals) && Object.keys(intervals).length >= MAX_ITEMS) {
    const oldest = Object.entries(intervals).sort((a, b) => a[1].lastAt - b[1].lastAt)[0]?.[0];
    if (oldest) delete intervals[oldest];
  }
  intervals[key] = observe(intervals[key] ?? newStat(), o);
  return { version: 2, notes: stats.notes, intervals };

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
      // Physical MIDI device latency is uncalibrated; do not weight reaction
      // speed across keyboards. Pitch outcomes still contribute errors.
      outcome: event.outcome,
      reactionMs: event.outcome === 'correct' && event.source === 'pc'
        ? event.reactionMs : null,
      at: nowMs,
      ...(prev ? { previousNoteName: prev.noteName, previousClef: prev.clef } : {})
    });
  }
  // A transition is verified only when the previous target was solved
  // with ONE correct input, and the current target was ultimately solved
  // with correct input by the SAME device. Corrections on the current target
  // count as ONE transition error, not a clean/fast interval observation.
  // A corrected previous target is never treated as a clean departure.
  for (let index = 1; index < score.length; index++) {
    const from = score[index - 1], to = score[index];
    if (!from || !to) continue;
    const preceding = events.filter(e => e.noteIndex === index - 1);
    const current = events.filter(e => e.noteIndex === index);
    if (preceding.length !== 1 || preceding[0]?.outcome !== 'correct' ||
        preceding[0].expectedNote !== from.noteName ||
        preceding[0].playedNote !== from.noteName ||
        !['pc', 'midi'].includes(preceding[0].source ?? '') ||
        !current.length) continue;
    const source = preceding[0].source!;
    if (!current.every(e => e.source === source && e.expectedNote === to.noteName &&
        (e.outcome === 'correct' || e.outcome === 'wrong-pitch'))) continue;
    const correct = current.filter(e => e.outcome === 'correct');
    if (correct.length !== 1 || current[current.length - 1] !== correct[0] ||
        correct[0].playedNote !== to.noteName) continue;
    const hasErrors = current.some(e => e.outcome === 'wrong-pitch');
    next = addPracticeIntervalObservation(next, {
      source, mode: 'reflex', noteName: to.noteName, clef: to.clef,
      previousNoteName: from.noteName, previousClef: from.clef,
      outcome: hasErrors ? 'wrong-pitch' : 'correct',
      // Only target-response timing on a clean *PC* transition is known.
      // MIDI hardware latency is uncalibrated. Do not infer note-onset timing.
      reactionMs: !hasErrors && source === 'pc' ? correct[0].reactionMs : null,
      at: nowMs
    });
  }
  return next;
}

export function validatePracticeStats(value: unknown): PracticeStats {
  if (!value || typeof value !== 'object') return emptyPracticeStats();
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1 && obj.version !== 2) return emptyPracticeStats();
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
  // v1 interval observations were inferred from *every* input, including
  // incorrect/assisted predecessor paths. Their reliability cannot be
  // recovered. Migrate note evidence, but never let old pair data affect
  // a new adaptive score.
  const notes = Object.fromEntries(Object.entries(read(obj.notes)).filter(([key]) =>
    /^(pc|midi):reflex:(treble|bass):[A-G](?:#|b)?[0-8]$/.test(key)));
  const intervals = obj.version === 2
    ? Object.fromEntries(Object.entries(read(obj.intervals)).filter(([key]) => {
      const match = /^(pc|midi):reflex:(treble|bass):([A-G](?:#|b)?[0-8]):to:(treble|bass):([A-G](?:#|b)?[0-8]):d([+-]?\d+):c([+-]?\d+)$/.exec(key);
      if (!match) return false;
      const actual = directedInterval({ clef: match[2] as ClefType, noteName: match[3] },
        { clef: match[4] as ClefType, noteName: match[5] });
      return actual !== null && actual.diatonicSteps === Number(match[6]) &&
        actual.chromaticSemitones === Number(match[7]);
    })) : {};
  return { version: 2, notes, intervals };
}
