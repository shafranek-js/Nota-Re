/**
 * Research-only online note activation -> discrete onsets.
 * Unlike activationFramesToOnsets(), this is genuinely incremental: every
 * callback is processed once, with bounded per-key state (<= 88 keys).
 * No score/target notes, buffers of previous audio, or note-off inference.
 */
export function createStreamingAttackTracker({
  minObservedFrames = 2, maxInactiveGapMs = 55
} = {}) {
  if (!Number.isSafeInteger(minObservedFrames) || minObservedFrames < 1 ||
      minObservedFrames > 20 || !Number.isFinite(maxInactiveGapMs) ||
      maxInactiveGapMs < 0 || maxInactiveGapMs > 500) {
    throw new Error('Invalid streaming attack tracker settings');
  }
  const states = new Map();
  let lastTimeMs = -Infinity;
  let seenFrames = 0;
  return {
    push(frame) {
      if (!frame || !Number.isFinite(frame.time) || frame.time < 0 ||
          frame.time * 1000 <= lastTimeMs || !Array.isArray(frame.notes)) {
        throw new Error('Invalid or nonmonotonic streaming frame');
      }
      const atMs = frame.time * 1000;
      lastTimeMs = atMs;
      seenFrames++;
      const seen = new Set();
      const attacks = [];
      for (const note of frame.notes) {
        if (!note || !Number.isSafeInteger(note.midi) || note.midi < 21 ||
            note.midi > 108 || !Number.isFinite(note.prob) ||
            note.prob < 0 || note.prob > 1 || seen.has(note.midi)) {
          throw new Error('Invalid/duplicate streaming pitch activation');
        }
        seen.add(note.midi);
        let state = states.get(note.midi);
        if (!state || atMs - state.lastSeenMs > maxInactiveGapMs) {
          state = {
            startMs: atMs, lastSeenMs: atMs, count: 0, peak: 0, emitted: false
          };
          states.set(note.midi, state);
        }
        state.lastSeenMs = atMs;
        state.count++;
        state.peak = Math.max(state.peak, note.prob);
        if (!state.emitted && state.count >= minObservedFrames) {
          attacks.push({
            midi: note.midi, onsetMs: state.startMs,
            confirmedAtMs: atMs, confidence: state.peak
          });
          state.emitted = true;
        }
      }
      for (const [midi, state] of states) {
        if (!seen.has(midi) && atMs - state.lastSeenMs > maxInactiveGapMs) {
          states.delete(midi);
        }
      }
      attacks.sort((a, b) => a.onsetMs - b.onsetMs || a.midi - b.midi);
      return attacks;
    },
    reset() {
      states.clear(); lastTimeMs = -Infinity; seenFrames = 0;
    },
    get stats() {
      return { seenFrames, activePitchStates: states.size, lastTimeMs };
    }
  };
}
