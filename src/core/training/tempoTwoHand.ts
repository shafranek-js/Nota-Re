import type { ExerciseScore } from '../notation/musicXml.ts';
import type { PracticeMidiEvent, TwoHandStep } from './twoHandPractice.ts';

/** The same absolute monotonic timebase as MIDI receivedAtMs (performance.now). */
export interface TempoPlan {
  readonly startMs: number;
  readonly bpm: number;
  readonly windowMs: number;
  readonly overlapMs: number;
  readonly holdGraceMs: number;
}

export interface TimedPracticeState {
  readonly stepIndex: number;
  readonly held: readonly { note: number; channel: number }[];
  readonly captured: readonly { note: number; channel: number; atMs: number }[];
  /** Expected keys whose note-off is still pending; sustain CC64 does not count. */
  readonly sustained: readonly { note: number; channel: number; untilMs: number }[];
  readonly hits: number;
  readonly misses: number;
  readonly earlyReleases: number;
  readonly wrongPitches: number;
  readonly lastDeviationMs: number | null;
  readonly feedback: 'count-in' | 'ready' | 'partial' | 'correct' | 'wrong' |
    'off-beat' | 'released-early' | 'missed' | 'complete';
  readonly finished: boolean;
}

export function validateTempoPlan(plan: TempoPlan): void {
  if (!Number.isFinite(plan.startMs) || plan.startMs < 0 ||
      !Number.isFinite(plan.bpm) || plan.bpm < 20 || plan.bpm > 240 ||
      !Number.isFinite(plan.windowMs) || plan.windowMs < 0 ||
      !Number.isFinite(plan.overlapMs) || plan.overlapMs < 0 ||
      !Number.isFinite(plan.holdGraceMs) || plan.holdGraceMs < 0) {
    throw new Error('Invalid timed-practice parameters');
  }
}

export function ticksToMs(ticks: number, bpm: number): number {
  if (!Number.isFinite(ticks) || !Number.isFinite(bpm) || bpm <= 0) {
    throw new Error('Invalid note timing');
  }
  return ticks * 15000 / bpm; // 4 MusicXML ticks per quarter note
}

export function initialTimedPractice(): TimedPracticeState {
  return {
    stepIndex: 0, held: [], captured: [], sustained: [], hits: 0,
    misses: 0, earlyReleases: 0, wrongPitches: 0,
    lastDeviationMs: null, feedback: 'count-in', finished: false
  };
}

type TimedEvent = PracticeMidiEvent | { type: 'tick'; receivedAtMs: number };

export function reduceTimedPractice(
  state: TimedPracticeState,
  score: ExerciseScore,
  steps: readonly TwoHandStep[],
  plan: TempoPlan,
  event: TimedEvent
): TimedPracticeState {
  validateTempoPlan(plan);
  if (state.finished) return state;
  if (event.type === 'panic') {
    // A disconnect stops all physical holds, not the time grid. The next
    // tick will mark missed onsets; never award a chord due to stuck keys.
    return { ...state, held: [], captured: [], sustained: [], feedback: 'ready' };
  }
  if (event.type === 'note-off') {
    const held = state.held.filter(k => k.note !== event.note || k.channel !== event.channel);
    const stillHeld = new Set(held.map(k => k.channel + ':' + k.note));
    const captured = state.captured.filter(k => stillHeld.has(k.channel + ':' + k.note));
    const releases = state.sustained.filter(k => k.note === event.note && k.channel === event.channel);
    // Note-off has no device timestamp in the original event. The caller
    // may pass a receivedAtMs from the same MIDI arrival clock.
    const releasedAtMs = 'receivedAtMs' in event ? event.receivedAtMs : NaN;
    const early = Number.isFinite(releasedAtMs) ?
      releases.filter(k => releasedAtMs < k.untilMs - plan.holdGraceMs).length : 0;
    return {
      ...state, held, captured,
      sustained: state.sustained.filter(k => k.note !== event.note || k.channel !== event.channel),
      earlyReleases: state.earlyReleases + early,
      feedback: early ? 'released-early' : state.feedback
    };
  }

  const now = event.receivedAtMs;
  if (!Number.isFinite(now)) throw new Error('Invalid MIDI event timestamp');

  let current = state;
  // Missed grid slots advance on elapsed musical time even when no MIDI
  // input arrives; no click or animation callback may award a correct note.
  while (current.stepIndex < steps.length &&
    now > plan.startMs + ticksToMs(steps[current.stepIndex].onsetTicks, plan.bpm) + plan.windowMs) {
    current = {
      ...current, stepIndex: current.stepIndex + 1, misses: current.misses + 1,
      captured: [], feedback: 'missed'
    };
  }

  const endTicks = Math.max(0, ...score.notes.map(n => n.onsetTicks + n.durationTicks));
  if (now >= plan.startMs + ticksToMs(endTicks, plan.bpm) + plan.windowMs) {
    return { ...current, stepIndex: steps.length, finished: true, feedback: 'complete' };
  }
  if (event.type === 'tick') {
    if (now < plan.startMs && current.feedback !== 'count-in') {
      return { ...current, feedback: 'count-in' };
    }
    if (now >= plan.startMs && current.feedback === 'count-in') {
      return { ...current, feedback: 'ready' };
    }
    return current;
  }

  if (current.held.some(key => key.channel === event.channel && key.note === event.note)) {
    return current; // repeated hardware NoteOn, not a new attack
  }
  const held = [...current.held, { note: event.note, channel: event.channel }];
  const step = steps[current.stepIndex];
  if (!step || now < plan.startMs) return { ...current, held, feedback: 'count-in' };

  const expectedAtMs = plan.startMs + ticksToMs(step.onsetTicks, plan.bpm);
  const deviation = now - expectedAtMs;
  if (Math.abs(deviation) > plan.windowMs) {
    return { ...current, held, feedback: 'off-beat', lastDeviationMs: Math.round(deviation) };
  }
  if (!step.expectedMidi.includes(event.note)) {
    return {
      ...current, held, captured: [], wrongPitches: current.wrongPitches + 1,
      feedback: 'wrong', lastDeviationMs: Math.round(deviation)
    };
  }
  // Distinct MIDI channels cannot substitute a duplicate pitch for another
  // member of a chord. Every pitch requires an actual new NoteOn.
  if (current.captured.some(k => k.note === event.note)) {
    return { ...current, held };
  }
  const first = Math.min(now, ...current.captured.map(k => k.atMs));
  const captured = now - first > plan.overlapMs
    ? [{ note: event.note, channel: event.channel, atMs: now }]
    : [...current.captured, { note: event.note, channel: event.channel, atMs: now }];
  const matches = step.expectedMidi.every(pitch =>
    captured.some(k => k.note === pitch &&
      held.some(h => h.note === pitch && h.channel === k.channel)));
  if (!matches) return { ...current, held, captured, feedback: 'partial' };

  // Hold targets are anchored at the SCORE's actual duration, not at the next
  // right-hand attack. The LH half-note must survive the intermediate beat.
  const sustained = [...current.sustained];
  for (const key of captured) {
    const scoreNote = score.notes.find(n => n.midi === key.note && n.onsetTicks === step.onsetTicks);
    if (scoreNote) {
      sustained.push({
        note: key.note, channel: key.channel,
        untilMs: plan.startMs + ticksToMs(scoreNote.onsetTicks + scoreNote.durationTicks, plan.bpm)
      });
    }
  }
  const stepIndex = current.stepIndex + 1;
  return {
    ...current, held, captured: [], sustained,
    stepIndex, hits: current.hits + 1,
    feedback: 'correct', lastDeviationMs: Math.round(deviation)
  };
}

/** OSMD cursor position follows the musical clock, not success count. */
export function currentScoreTick(plan: TempoPlan, nowMs: number, score: ExerciseScore): number {
  validateTempoPlan(plan);
  const end = Math.max(0, ...score.notes.map(n => n.onsetTicks + n.durationTicks));
  const ticks = (nowMs - plan.startMs) * plan.bpm / 15000;
  return Math.min(end, Math.max(0, ticks));
}
