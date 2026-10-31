import { addQuarter, compareQuarter, type QuarterTime, type ScoreDocument, type ScoreEvent,
  type ScoreMeasureRange } from '../notation/scoreDocument.ts';
import type { TimedTone } from '../audio/audioTimeline.ts';

/**
 * Free, self-paced polyphonic MIDI rehearsal. Never returns AttemptSnapshot,
 * lesson evidence or course credit. Sound produced by the companion is output,
 * not an input event and must not be fed back into this reducer.
 */
export type PolyphonicHandMode = 'both' | 'right' | 'left';
export interface PolyphonicNote {
  readonly eventId: string;
  readonly midi: number;
  readonly staff: number;
}
export interface PolyphonicStep {
  readonly onset: QuarterTime;
  readonly measureId: string;
  readonly targets: readonly PolyphonicNote[];
  /** Relative to this step's onset; the other hand may strike between targets. */
  readonly companion: readonly TimedTone[];
}
export interface PolyphonicPlan {
  readonly mode: PolyphonicHandMode;
  readonly steps: readonly PolyphonicStep[];
  readonly reason: string | null;
}
export type PolyphonicPhase = 'idle' | 'playing' | 'complete';
export interface PolyphonicTrial {
  readonly phase: PolyphonicPhase;
  readonly index: number;
  /** Number of fully completed onset groups (not individual keys). */
  readonly correct: number;
  readonly wrong: number;
  readonly held: readonly number[];
  readonly matched: readonly number[];
  readonly completedStepIndex: number | null;
  readonly last: 'correct' | 'wrong' | null;
}
export type PolyphonicKeyEvent =
  | { readonly type: 'note-on'; readonly note: number }
  | { readonly type: 'note-off'; readonly note: number };

const empty = (mode: PolyphonicHandMode, reason: string): PolyphonicPlan =>
  ({ mode, reason, steps: [] });
const asBeats = (t: QuarterTime): number => t.numerator / t.denominator;
const endOf = (e: ScoreEvent): QuarterTime => addQuarter(e.onset, e.duration);

/** Integrate exact score-time tempo-change boundaries, never assume fixed 4/4. */
function elapsedSeconds(score: ScoreDocument, from: QuarterTime, to: QuarterTime): number {
  if (compareQuarter(from, to) >= 0) return 0;
  let bpm = 80;
  for (const change of score.tempos) {
    if (compareQuarter(change.onset, from) > 0) break;
    bpm = change.quarterBpm;
  }
  let at = from, seconds = 0;
  for (const change of score.tempos) {
    if (compareQuarter(change.onset, from) <= 0) continue;
    if (compareQuarter(change.onset, to) >= 0) break;
    seconds += (asBeats(change.onset) - asBeats(at)) * 60 / bpm;
    bpm = change.quarterBpm;
    at = change.onset;
  }
  return seconds + (asBeats(to) - asBeats(at)) * 60 / bpm;
}

/**
 * Limited to a single piano part, one voice per staff and at most two staves.
 * Explicitly reject ties and duplicate same-pitch simultaneous attacks until
 * they can be reconciled to distinct physical note-on evidence.
 */
export function planPolyphonicRehearsal(
  score: ScoreDocument, range: ScoreMeasureRange, mode: PolyphonicHandMode
): PolyphonicPlan {
  if (score.source !== 'imported') return empty(mode, 'Только импортированная MusicXML-партитура.');
  if (score.parts.length !== 1 || score.parts[0]!.staves > 2) {
    return empty(mode, 'Пока поддерживается одна партия на одном или двух станах.');
  }
  if (mode !== 'both' && score.parts[0]!.staves !== 2) {
    return empty(mode, 'Раздельные руки доступны только для партии с двумя станами.');
  }
  if (score.events.some(e => e.tieToId)) {
    return empty(mode, 'Связующие лиги пока не поддерживаются в полифонической практике.');
  }
  const measureIds = new Set(range.measureIds);
  const events = score.events.filter(e => e.kind === 'note' && measureIds.has(e.measureId));
  if (!events.length) return empty(mode, 'В выбранных тактах нет нот.');
  if (events.length > 512) return empty(mode, 'Выберите не более 512 нот.');
  if (events.some(e => !e.pitch || !Number.isSafeInteger(e.pitch.midi) ||
      e.pitch.midi < 21 || e.pitch.midi > 108)) {
    return empty(mode, 'Неподдерживаемая высота ноты вне диапазона фортепиано A0–C8.');
  }
  const voicesByStaff = new Map<number, Set<string>>();
  for (const event of score.events) {
    const voices = voicesByStaff.get(event.staff) ?? new Set<string>();
    voices.add(event.voice);
    voicesByStaff.set(event.staff, voices);
  }
  if ([...voicesByStaff.values()].some(voices => voices.size !== 1)) {
    return empty(mode, 'Несколько независимых голосов на одном стане пока не поддерживаются.');
  }
  // A prior sounding note must not be silently converted to a new attack at A.
  if (score.events.some(e => e.kind === 'note' && compareQuarter(e.onset, range.start) < 0 &&
      compareQuarter(endOf(e), range.start) > 0)) {
    return empty(mode, 'Через границу A удерживается нота из предыдущего такта.');
  }
  const ordered = [...events].sort((a, b) =>
    compareQuarter(a.onset, b.onset) || a.staff - b.staff ||
    a.pitch!.midi - b.pitch!.midi);
  // Duplicate pitches at an onset across hands cannot be proved independently
  // by one physical key. Do not flatten them into a single correct attack.
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!, curr = ordered[i]!;
    if (compareQuarter(prev.onset, curr.onset) === 0 && prev.pitch!.midi === curr.pitch!.midi) {
      return empty(mode, 'Одновременная одинаковая высота на двух станах неоднозначна для MIDI.');
    }
  }
  const targetStaff = mode === 'right' ? 1 : mode === 'left' ? 2 : null;
  const targets = ordered.filter(e => targetStaff === null || e.staff === targetStaff);
  if (!targets.length) return empty(mode, 'Для выбранной руки в диапазоне нет нот.');
  const groups: ScoreEvent[][] = [];
  for (const event of targets) {
    const last = groups[groups.length - 1];
    if (last && compareQuarter(last[0]!.onset, event.onset) === 0) last.push(event);
    else groups.push([event]);
  }
  if (groups.length > 128) return empty(mode, 'Выберите не более 128 шагов.');
  const companionEvents = ordered.filter(e => targetStaff !== null && e.staff !== targetStaff);
  if (companionEvents.length &&
      compareQuarter(companionEvents[0]!.onset, groups[0]![0]!.onset) < 0) {
    return empty(mode, 'Сопровождение начинается раньше выбранной руки; начните с другого диапазона A–B.');
  }
  const steps = groups.map((group, index): PolyphonicStep => {
    const from = group[0]!.onset;
    const next = groups[index + 1]?.[0]?.onset ?? range.end;
    const accompaniment = companionEvents.filter(e =>
      compareQuarter(e.onset, from) >= 0 && compareQuarter(e.onset, next) < 0);
    const companion: TimedTone[] = accompaniment.map(e => {
      const limit = compareQuarter(endOf(e), range.end) > 0 ? range.end : endOf(e);
      const duration = elapsedSeconds(score, e.onset, limit);
      return {
        offsetSeconds: elapsedSeconds(score, from, e.onset),
        durationSeconds: e.articulation === 'staccato' ?
          Math.min(0.12, duration * 0.55) : duration * 0.96,
        frequencyHz: 440 * Math.pow(2, (e.pitch!.midi - 69) / 12),
        staccato: e.articulation === 'staccato'
      };
    });
    return {
      onset: from, measureId: group[0]!.measureId,
      targets: group.map(e => ({ eventId: e.id, midi: e.pitch!.midi, staff: e.staff })),
      companion
    };
  });
  return { mode, steps, reason: null };
}

export const initialPolyphonicTrial = (): PolyphonicTrial => ({
  phase: 'idle', index: 0, correct: 0, wrong: 0,
  held: [], matched: [], completedStepIndex: null, last: null
});

export function startPolyphonicTrial(plan: PolyphonicPlan): PolyphonicTrial {
  return plan.reason || !plan.steps.length ? initialPolyphonicTrial()
    : { ...initialPolyphonicTrial(), phase: 'playing' };
}

/**
 * A chord is completed only when every required fresh MIDI Note On is still
 * physically held. Releasing part of an unfinished chord clears that attack.
 * Already-held pitches never satisfy a repeated attack in the next step.
 * Pedal messages never simulate Note On/Off.
 */
export function recordPolyphonicKey(
  state: PolyphonicTrial, plan: PolyphonicPlan, event: PolyphonicKeyEvent
): PolyphonicTrial {
  if (state.phase !== 'playing' || plan.reason ||
      !Number.isSafeInteger(event.note) || event.note < 0 || event.note > 127) return state;
  if (event.type === 'note-off') {
    if (!state.held.includes(event.note)) return state;
    return { ...state, held: state.held.filter(p => p !== event.note),
      matched: state.matched.filter(p => p !== event.note) };
  }
  if (state.held.includes(event.note)) return state;
  const held = [...state.held, event.note];
  const step = plan.steps[state.index];
  if (!step) return state;
  if (!step.targets.some(t => t.midi === event.note)) {
    return { ...state, held, wrong: state.wrong + 1, last: 'wrong' };
  }
  const matched = [...state.matched, event.note];
  if (!step.targets.every(t => matched.includes(t.midi))) {
    return { ...state, held, matched, last: null };
  }
  const next = state.index + 1;
  return { ...state, held, matched: [], index: next,
    correct: state.correct + 1, last: 'correct',
    completedStepIndex: state.index,
    phase: next >= plan.steps.length ? 'complete' : 'playing' };
}
