/**
 * Web MIDI's Event.timeStamp is the system's MIDI-message receipt time
 * (DOMHighResTimeStamp), not the player's physical key-onset time.
 * Some synthetic events or browsers omit it or expose incompatible clocks.
 * Invalid/implausible timestamps are skipped; they never affect scoring.
 */
export function validatedMidiSystemTime(
  eventTimestampMs: number | undefined,
  callbackNowMs: number
): number | null {
  if (typeof eventTimestampMs !== 'number' ||
      !Number.isFinite(eventTimestampMs) || eventTimestampMs <= 0 ||
      !Number.isFinite(callbackNowMs)) return null;
  const queueMs = callbackNowMs - eventTimestampMs;
  return queueMs >= 0 && queueMs <= 10_000 ? eventTimestampMs : null;
}
