/** First-cut frame-activation to estimated attacks converter; NOT physical onset recovery.
 * This cannot recognize a retrigger when the same pitch remains active (e.g. under sustain pedal).
 * The converter never reads score targets and never fabricates keyboard release evidence.
 */
export interface DetectedActivationFrame {
  /** Timestamp within the recorded audio, seconds. */
  readonly time: number;
  readonly notes: readonly { readonly midi: number; readonly prob: number }[];
}
export interface ActivationOnsetOptions {
  readonly minObservedFrames?: number;
  readonly maxInactiveGapMs?: number;
}
export interface EstimatedOnset {
  readonly midi: number;
  readonly onsetMs: number;
  readonly confidence: number;
}
interface PitchState {
  start: number;
  lastSeen: number;
  observed: number;
  strongest: number;
  emitted: boolean;
}

/** Emit one onset at first activation after an inactive gap, once sufficiently observed. */
export function activationFramesToOnsets(
  frames: readonly DetectedActivationFrame[], options: ActivationOnsetOptions = {}
): EstimatedOnset[] {
  const minObservedFrames = options.minObservedFrames ?? 2;
  const maxInactiveGapMs = options.maxInactiveGapMs ?? 55;
  if (!Number.isSafeInteger(minObservedFrames) || minObservedFrames < 1 || minObservedFrames > 20 ||
      !Number.isFinite(maxInactiveGapMs) || maxInactiveGapMs < 0 || maxInactiveGapMs > 500) {
    throw new Error('Invalid activation onset options');
  }
  const states = new Map<number, PitchState>();
  const result: EstimatedOnset[] = [];
  let lastFrameTime = -Infinity;
  for (const frame of frames) {
    const at = frame.time * 1000;
    if (!Number.isFinite(at) || at < 0 || at <= lastFrameTime || !Array.isArray(frame.notes)) {
      throw new Error('Invalid activation frame time or note array');
    }
    lastFrameTime = at;
    const seen = new Set<number>();
    for (const note of frame.notes) {
      if (!Number.isSafeInteger(note.midi) || note.midi < 21 || note.midi > 108 ||
          !Number.isFinite(note.prob) || note.prob < 0 || note.prob > 1 || seen.has(note.midi)) {
        throw new Error('Invalid or duplicate activation pitch');
      }
      seen.add(note.midi);
      let state = states.get(note.midi);
      if (!state || at - state.lastSeen > maxInactiveGapMs) {
        state = { start: at, lastSeen: at, observed: 0, strongest: 0, emitted: false };
        states.set(note.midi, state);
      }
      state.lastSeen = at;
      state.observed++;
      state.strongest = Math.max(state.strongest, note.prob);
      if (!state.emitted && state.observed >= minObservedFrames) {
        result.push({ midi: note.midi, onsetMs: state.start, confidence: state.strongest });
        state.emitted = true;
      }
    }
    for (const [midi, state] of states) {
      if (!seen.has(midi) && at - state.lastSeen > maxInactiveGapMs) states.delete(midi);
    }
  }
  result.sort((a, b) => a.onsetMs - b.onsetMs || a.midi - b.midi);
  return result;
}
