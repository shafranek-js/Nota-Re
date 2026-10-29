/** Count-in beats are preparatory quarter-note pulses, not a claimed time signature. */
export const COUNT_IN_BEATS = 4;

export function countInBeatDurationMs(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('BPM must be positive');
  return 60000 / bpm;
}

export function countInIndex(elapsedMs: number, bpm: number): number {
  if (!Number.isFinite(elapsedMs)) return 0;
  return Math.min(COUNT_IN_BEATS, Math.max(1, Math.floor(Math.max(0, elapsedMs) / countInBeatDurationMs(bpm)) + 1));
}

export function countInFinished(elapsedMs: number, bpm: number): boolean {
  return elapsedMs >= COUNT_IN_BEATS * countInBeatDurationMs(bpm);
}
