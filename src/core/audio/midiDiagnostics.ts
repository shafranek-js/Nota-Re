/**
 * Local, bounded instrumentation of the synchronous MIDI -> audio-dispatch
 * path. This intentionally does NOT claim to measure acoustic/speaker latency:
 * the sample ends when JS has queued noteOn to SpessaSynth or oscillator.start.
 * No note pitches, device identifiers or per-event timestamps are retained.
 */
export type AudioRoute = 'soundfont' | 'oscillator';

export interface MidiAudioDiagnostics {
  readonly samples: number;
  readonly medianDispatchMs: number | null;
  readonly p95DispatchMs: number | null;
  readonly maxDispatchMs: number | null;
  readonly soundFontCount: number;
  readonly oscillatorCount: number;
  readonly activeVoices: number;
  readonly peakVoices: number;
  readonly sustainedChannels: number;
}

function quantile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * fraction;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
}

export class MidiAudioDiagnosticsTracker {
  private readonly recentMs: number[] = [];
  private soundFontCount = 0;
  private oscillatorCount = 0;
  private activeVoices = 0;
  private peakVoices = 0;
  private sustainedChannels = 0;
  private readonly observers = new Set<() => void>();

  private readonly historyLimit: number;

  constructor(historyLimit = 128) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1) {
      throw new Error('A positive history limit is required');
    }
    this.historyLimit = historyLimit;
  }

  recordDispatch(receivedAtMs: number, dispatchedAtMs: number, route: AudioRoute): void {
    if (!Number.isFinite(receivedAtMs) || !Number.isFinite(dispatchedAtMs) ||
        dispatchedAtMs < receivedAtMs) return;
    const delta = dispatchedAtMs - receivedAtMs;
    this.recentMs.push(delta);
    if (this.recentMs.length > this.historyLimit) this.recentMs.shift();
    if (route === 'soundfont') this.soundFontCount++;
    else this.oscillatorCount++;
    this.publish();
  }

  updateVoices(voices: number, sustainChannels: number): void {
    this.activeVoices = Math.max(0, voices);
    this.peakVoices = Math.max(this.peakVoices, this.activeVoices);
    this.sustainedChannels = Math.max(0, sustainChannels);
    this.publish();
  }

  reset(): void {
    this.recentMs.length = 0;
    this.soundFontCount = 0;
    this.oscillatorCount = 0;
    this.peakVoices = this.activeVoices;
    this.publish();
  }

  snapshot(): MidiAudioDiagnostics {
    const sorted = [...this.recentMs].sort((a, b) => a - b);
    return {
      samples: this.recentMs.length,
      medianDispatchMs: quantile(sorted, 0.5),
      p95DispatchMs: quantile(sorted, 0.95),
      maxDispatchMs: sorted.length ? sorted[sorted.length - 1] : null,
      soundFontCount: this.soundFontCount,
      oscillatorCount: this.oscillatorCount,
      activeVoices: this.activeVoices,
      peakVoices: this.peakVoices,
      sustainedChannels: this.sustainedChannels
    };
  }

  subscribe(callback: () => void): () => void {
    this.observers.add(callback);
    return () => { this.observers.delete(callback); };
  }

  private publish(): void {
    for (const observer of this.observers) observer();
  }
}
