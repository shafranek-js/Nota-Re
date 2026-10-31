/**
 * Converts Spotify Basic Pitch's post-processed note events to the same
 * independent onset evidence used by the PitchPlease offline benchmark.
 * Events do not contain end-to-end live latency or physical key release data.
 */
export interface BasicPitchNoteEvent {
  readonly startTimeSeconds: number;
  readonly pitchMidi: number;
  readonly amplitude: number;
}
export interface BasicPitchOnset {
  readonly midi: number;
  readonly onsetMs: number;
  readonly confidence: number;
}
export function basicPitchNotesToOnsets(events: readonly BasicPitchNoteEvent[]): BasicPitchOnset[] {
  if (!Array.isArray(events)) throw new Error('Basic Pitch note events must be an array');
  const results = events.map((event, index): BasicPitchOnset => {
    if (!event || !Number.isSafeInteger(event.pitchMidi) ||
        event.pitchMidi < 21 || event.pitchMidi > 108 ||
        !Number.isFinite(event.startTimeSeconds) || event.startTimeSeconds < 0 ||
        !Number.isFinite(event.amplitude) || event.amplitude < 0 || event.amplitude > 1) {
      throw new Error('Invalid Basic Pitch note event ' + index);
    }
    return {
      midi: event.pitchMidi,
      onsetMs: event.startTimeSeconds * 1000,
      confidence: event.amplitude
    };
  });
  return results.sort((a, b) => a.onsetMs - b.onsetMs || a.midi - b.midi);
}
