import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { applyTonalityToPitch, type GenerateOptions } from './ExerciseGenerator.ts';
import type { ExerciseNote } from '../../types/music';
import { noteStatisticsKey, intervalStatisticsKey,
  type PracticeSource, type PracticeStats } from '../training/practiceStatistics.ts';
import { directedInterval, directedIntervalLabel } from '../training/directedInterval.ts';

export interface AdaptiveChoice {
  readonly noteName: string;
  readonly weight: number;
  readonly sampleCount: number;
  readonly errorCount: number;
  readonly avgReactionMs: number | null;
}
export interface AdaptiveTransitionChoice extends AdaptiveChoice {
  readonly from: string | null;
  readonly intervalLabel: string | null;
  readonly intervalObservations: number;
  readonly intervalErrors: number;
  readonly intervalBoost: number;
  readonly totalWeight: number;
}
export interface AdaptiveTraceStep {
  readonly position: number;
  readonly from: string | null;
  readonly selected: string;
  readonly candidates: readonly AdaptiveTransitionChoice[];
}
export interface AdaptiveTrace {
  readonly seed: number;
  readonly source: PracticeSource;
  readonly candidates: readonly AdaptiveChoice[];
  readonly chosen: readonly string[];
  readonly steps: readonly AdaptiveTraceStep[];
}
export interface AdaptiveExercise {
  readonly notes: ExerciseNote[];
  readonly trace: AdaptiveTrace;
}

/** Stable seed for reproducible diagnostic exercises, independent of Math.random. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function reflexPitchPool(opts: GenerateOptions): string[] {
  const treble = opts.filter === 'treble_oct2'
    ? ['C4','D4','E4','F4','G4','A4','B4','C5','D5']
    : ['C4','D4','E4','F4','G4'];
  const bass = ['C3','D3','E3','F3','G3','A3','B3'];
  const selected = opts.filter === 'bass' ? bass : treble;
  return selected.map(name => applyTonalityToPitch(name, opts.tonality));
}
export function weightedReflexCandidates(
  pool: readonly string[], stats: PracticeStats, source: PracticeSource
): AdaptiveChoice[] {
  return [...new Set(pool)].map(noteName => {
    const def = MIDI_NOTE_MAP[noteName];
    if (!def) throw new Error('Adaptive candidate not present in source key map: ' + noteName);
    const stat = stats.notes[noteStatisticsKey(source, 'reflex',
      { noteName, clef: def.clef })];
    const avgReactionMs = stat && stat.reactionSamples > 0
      ? stat.reactionSumMs / stat.reactionSamples : null;
    // Bounded boost, minimum probability retained for all eligible notes.
    const weight = Math.min(4, 1 + 0.1 * Math.min(30, stat?.activeErrors ?? 0) +
      (avgReactionMs !== null && avgReactionMs > 750 ? 0.5 : 0));
    return { noteName, weight, sampleCount: stat?.observations ?? 0,
      errorCount: stat?.activeErrors ?? 0, avgReactionMs };
  });
}
export function chooseAdaptiveNotes(candidates: readonly AdaptiveChoice[],
  count: number, seed: number): readonly string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 128 ||
      !Number.isSafeInteger(seed) || !candidates.length ||
      !candidates.every(c => c.weight >= 1 && c.weight <= 4 && Number.isFinite(c.weight))) {
    throw new Error('Invalid adaptive selection.');
  }
  const random = seededRandom(seed);
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    // Two consecutive repetitions allowed; a third requires a different pitch
    // when the preset actually has another candidate.
    const options = candidates.length > 1 && i >= 2 &&
      result[i - 1] === result[i - 2]
      ? candidates.filter(item => item.noteName !== result[i - 1]) : [...candidates];
    const total = options.reduce((sum, item) => sum + item.weight, 0);
    let ticket = random() * total;
    let selected = options[options.length - 1]!.noteName;
    for (const candidate of options) {
      ticket -= candidate.weight;
      if (ticket < 0) { selected = candidate.noteName; break; }
    }
    result.push(selected);
  }
  return result;
}
/**
 * Select the next note by both its pitch evidence and the actual spelled,
 * directed transition from the previous chosen note. Weight is capped at 6
 * with minimum 1, so unseen/clean notes remain reachable. This is not a
 * harmonic or melodic-composition algorithm; it is an optional reading drill.
 */
export function weightedReflexTransitions(
  candidates: readonly AdaptiveChoice[], from: string | null,
  stats: PracticeStats, source: PracticeSource
): AdaptiveTransitionChoice[] {
  return candidates.map(candidate => {
    let intervalObservations = 0;
    let intervalErrors = 0;
    let intervalBoost = 0;
    let intervalLabel: string | null = null;
    if (from !== null) {
      const previous = MIDI_NOTE_MAP[from], next = MIDI_NOTE_MAP[candidate.noteName];
      const pair = previous && next ? directedInterval(
        { noteName: from, clef: previous.clef },
        { noteName: candidate.noteName, clef: next.clef }) : null;
      if (!pair || !previous || !next) throw new Error('Invalid interval candidate.');
      intervalLabel = directedIntervalLabel(pair);
      const pairKey = intervalStatisticsKey(source, 'reflex',
        { noteName: from, clef: previous.clef },
        { noteName: candidate.noteName, clef: next.clef });
      const recorded = stats.intervals[pairKey];
      intervalObservations = recorded?.observations ?? 0;
      intervalErrors = recorded?.activeErrors ?? 0;
      const mean = recorded && recorded.reactionSamples > 0
        ? recorded.reactionSumMs / recorded.reactionSamples : null;
      // No observed interval means no boost, never guessed difficulty.
      intervalBoost = Math.min(2, 0.1 * Math.min(15, intervalErrors) +
        (mean !== null && mean > 750 ? 0.5 : 0));
    }
    return { ...candidate, from, intervalLabel,
      intervalObservations, intervalErrors, intervalBoost,
      totalWeight: Math.min(6, candidate.weight + intervalBoost) };
  });
}

export function chooseAdaptiveTransitions(
  candidates: readonly AdaptiveChoice[], count: number, seed: number,
  stats: PracticeStats, source: PracticeSource
): { readonly chosen: readonly string[]; readonly steps: readonly AdaptiveTraceStep[] } {
  if (!Number.isSafeInteger(count) || count < 1 || count > 128 ||
      !Number.isSafeInteger(seed) || candidates.length < 1 ||
      !candidates.every(c => Number.isFinite(c.weight) && c.weight >= 1 &&
        c.weight <= 4 && MIDI_NOTE_MAP[c.noteName])) {
    throw new Error('Invalid adaptive interval selection.');
  }
  const random = seededRandom(seed);
  const chosen: string[] = [], steps: AdaptiveTraceStep[] = [];
  for (let i = 0; i < count; i++) {
    const from = chosen.length ? chosen[chosen.length - 1] : null;
    const eligible = candidates.length > 1 && i >= 2 &&
      chosen[i - 1] === chosen[i - 2]
      ? candidates.filter(item => item.noteName !== chosen[i - 1]) : [...candidates];
    const weighted = weightedReflexTransitions(eligible, from, stats, source);
    const total = weighted.reduce((sum, candidate) => sum + candidate.totalWeight, 0);
    let ticket = random() * total;
    let selected = weighted[weighted.length - 1]!.noteName;
    for (const item of weighted) {
      ticket -= item.totalWeight;
      if (ticket < 0) { selected = item.noteName; break; }
    }
    chosen.push(selected);
    steps.push({ position: i + 1, from, selected, candidates: weighted });
  }
  return { chosen, steps };
}

/** Only call after explicit opt-in for standalone, non-flow Reflex practice. */
export function generateAdaptiveReflexExercise(opts: GenerateOptions,
  stats: PracticeStats, source: PracticeSource, seed: number): AdaptiveExercise {
  if (opts.mode !== 'reflex' || opts.filter === 'both' ||
      !Number.isSafeInteger(opts.scoreNoteCount) || opts.scoreNoteCount < 1 ||
      opts.scoreNoteCount > 128) {
    throw new Error('Adaptive practice is only valid for single-staff Reflex.');
  }
  const candidates = weightedReflexCandidates(reflexPitchPool(opts), stats, source);
  const { chosen, steps } = chooseAdaptiveTransitions(
    candidates, opts.scoreNoteCount, seed, stats, source);
  const notes: ExerciseNote[] = chosen.map((noteName, idx) => ({
    id: idx, noteName, ...MIDI_NOTE_MAP[noteName]!,
    articulation: 'legato', syllable: 'ТА', durMultiplier: 1,
    status: idx === 0 ? 'current' : 'pending'
  }));
  return { notes, trace: { seed, source, candidates, chosen, steps } };
}
