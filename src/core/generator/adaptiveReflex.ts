import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { applyTonalityToPitch, type GenerateOptions } from './ExerciseGenerator.ts';
import type { ExerciseNote } from '../../types/music';
import { noteStatisticsKey, type PracticeSource, type PracticeStats } from '../training/practiceStatistics.ts';

export interface AdaptiveChoice {
  readonly noteName: string;
  readonly weight: number;
  readonly sampleCount: number;
  readonly errorCount: number;
  readonly avgReactionMs: number | null;
}
export interface AdaptiveTrace {
  readonly seed: number;
  readonly source: PracticeSource;
  readonly candidates: readonly AdaptiveChoice[];
  readonly chosen: readonly string[];
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
/** Only call after explicit opt-in for standalone, non-flow Reflex practice. */
export function generateAdaptiveReflexExercise(opts: GenerateOptions,
  stats: PracticeStats, source: PracticeSource, seed: number): AdaptiveExercise {
  if (opts.mode !== 'reflex' || opts.filter === 'both' ||
      !Number.isSafeInteger(opts.scoreNoteCount) || opts.scoreNoteCount < 1 ||
      opts.scoreNoteCount > 128) {
    throw new Error('Adaptive practice is only valid for single-staff Reflex.');
  }
  const candidates = weightedReflexCandidates(reflexPitchPool(opts), stats, source);
  const chosen = chooseAdaptiveNotes(candidates, opts.scoreNoteCount, seed);
  const notes: ExerciseNote[] = chosen.map((noteName, idx) => ({
    id: idx, noteName, ...MIDI_NOTE_MAP[noteName]!,
    articulation: 'legato', syllable: 'ТА', durMultiplier: 1,
    status: idx === 0 ? 'current' : 'pending'
  }));
  return { notes, trace: { seed, source, candidates, chosen } };
}
