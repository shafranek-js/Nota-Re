import { addQuarter, compareQuarter, type ScoreDocument, type ScoreEvent, type ScoreMeasureRange } from '../notation/scoreDocument.ts';

/**
 * Isolated, self-paced MIDI pitch recognition for imported repertoire.
 * It cannot produce a timed AttemptSnapshot or change course certification.
 * Rests are visual score context, NOT automatic misses or timed deadlines.
 */
export interface PitchTrialStep {
  readonly eventId: string;
  readonly measureId: string;
  readonly midi: number;
}
export interface PitchTrialPlan {
  readonly steps: readonly PitchTrialStep[];
  readonly reason: string | null;
}
export type PitchTrialPhase = 'idle' | 'playing' | 'complete';
export interface PitchTrialState {
  readonly phase: PitchTrialPhase;
  readonly index: number;
  readonly correct: number;
  readonly wrong: number;
  readonly last: 'correct' | 'wrong' | null;
}

const unavailable = (reason: string): PitchTrialPlan => ({ steps: [], reason });

/**
 * Strict v1 gate. Do not flatten polyphony or tied-onset continuations into
 * apparent new key presses, and do not guess at unverified SVG noteheads.
 * A–B range is an immutable selection of *source* measure IDs.
 */
export function planRepertoirePitchTrial(
  score: ScoreDocument,
  range: ScoreMeasureRange
): PitchTrialPlan {
  if (score.source !== 'imported') return unavailable('Практика доступна только для импортированной партитуры.');
  if (score.parts.length !== 1 || score.parts[0]?.staves !== 1) {
    return unavailable('Пока поддерживается только одна партия на одном нотном стане.');
  }
  const voices = new Set(score.events.map(event => event.partId + ':' + event.staff + ':' + event.voice));
  if (voices.size !== 1) return unavailable('Несколько голосов пока доступны только для просмотра.');
  if (score.events.some(event => event.tieToId)) {
    return unavailable('Лиги продления пока не поддерживаются в пошаговой практике.');
  }
  const measureIds = new Set(range.measureIds);
  const notes: ScoreEvent[] = score.events
    .filter(event => event.kind === 'note' && measureIds.has(event.measureId))
    .sort((a, b) => compareQuarter(a.onset, b.onset));
  if (!notes.length) return unavailable('В выбранных тактах нет нот для игры.');
  if (notes.length > 128) return unavailable('Выберите диапазон не более 128 нот.');
  const steps: PitchTrialStep[] = [];
  let previous: ScoreEvent | null = null;
  for (const event of notes) {
    if (!event.pitch || !Number.isSafeInteger(event.pitch.midi) ||
        event.pitch.midi < 0 || event.pitch.midi > 127) {
      return unavailable('Неизвестная MIDI-высота в импортированной партитуре.');
    }
    if (previous && compareQuarter(event.onset, addQuarter(previous.onset, previous.duration)) < 0) {
      return unavailable('Одновременные или перекрывающиеся ноты пока недоступны в этом режиме.');
    }
    steps.push({ eventId: event.id, measureId: event.measureId, midi: event.pitch.midi });
    previous = event;
  }
  return { steps, reason: null };
}

export function initialPitchTrial(): PitchTrialState {
  return { phase: 'idle', index: 0, correct: 0, wrong: 0, last: null };
}
export function startPitchTrial(plan: PitchTrialPlan): PitchTrialState {
  return plan.reason || !plan.steps.length ? initialPitchTrial() :
    { phase: 'playing', index: 0, correct: 0, wrong: 0, last: null };
}
export function stopPitchTrial(): PitchTrialState {
  return initialPitchTrial();
}
export function recordPitchTrialNote(
  state: PitchTrialState, plan: PitchTrialPlan, midi: number
): PitchTrialState {
  if (state.phase !== 'playing' || plan.reason || !Number.isSafeInteger(midi) ||
      midi < 0 || midi > 127) return state;
  const expected = plan.steps[state.index];
  if (!expected) return state;
  if (midi !== expected.midi) return { ...state, wrong: state.wrong + 1, last: 'wrong' };
  const index = state.index + 1;
  return { ...state, index, correct: state.correct + 1,
    last: 'correct', phase: index === plan.steps.length ? 'complete' : 'playing' };
}
