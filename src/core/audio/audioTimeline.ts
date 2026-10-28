/**
 * Preview playback is defined once in musical beats, then resolved onto the
 * AudioContext clock. JS wakeups only fill a short lookahead window: they do
 * not define the onset time for sound generation.
 */
export interface PreviewNote {
  readonly freq: number;
  readonly durMultiplier?: number;
  readonly articulation?: 'legato' | 'staccato';
}
export interface TimedTone {
  readonly offsetSeconds: number;
  readonly durationSeconds: number;
  readonly frequencyHz: number;
  readonly staccato: boolean;
}

function quarterSeconds(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Invalid playback BPM');
  return 60 / bpm;
}

export function sequenceTimeline(notes: readonly PreviewNote[], bpm: number): TimedTone[] {
  const beat = quarterSeconds(bpm);
  let offset = 0;
  return notes.map(note => {
    const length = note.durMultiplier ?? 1;
    if (!Number.isFinite(note.freq) || note.freq <= 0 ||
        !Number.isFinite(length) || length <= 0) {
      throw new Error('Invalid playback note or duration');
    }
    const duration = length * beat;
    const event: TimedTone = {
      offsetSeconds: offset,
      durationSeconds: Math.min(note.articulation === 'staccato' ? 0.12 : duration * 0.9, duration),
      frequencyHz: note.freq,
      staccato: note.articulation === 'staccato'
    };
    offset += duration;
    return event;
  });
}

export function syllableTimeline(
  pattern: 'ta' | 'titi' | 'tiritiri' | 'taa', bpm: number
): TimedTone[] {
  const beat = quarterSeconds(bpm);
  const positions = pattern === 'ta' ? [0, 1, 2, 3]
    : pattern === 'titi' ? [0, 0.5, 1, 2, 2.5, 3]
    : pattern === 'tiritiri' ? [0, 0.25, 0.5, 0.75, 1, 2, 2.25, 2.5, 2.75, 3]
    : [0, 2, 3];
  const duration = pattern === 'ta' ? 0.4 : pattern === 'titi' ? 0.22
    : pattern === 'tiritiri' ? 0.12 : 0.4;
  return positions.map((position, i) => ({
    offsetSeconds: position * beat,
    durationSeconds: pattern === 'taa' && i === 0 ? 1.2 : duration,
    frequencyHz: 392,
    staccato: false
  }));
}

export function articulationTimeline(bpm: number): TimedTone[] {
  const beat = quarterSeconds(bpm);
  const left = [0, 1, 2, 3].map(position => ({
    offsetSeconds: position * beat,
    durationSeconds: 0.12,
    frequencyHz: 130.81,
    staccato: true
  }));
  const rightFrequencies = [261.63, 293.66, 329.63, 349.23, 392, 349.23, 329.63, 293.66];
  const right = rightFrequencies.map((frequencyHz, i) => ({
    offsetSeconds: i * 0.5 * beat,
    durationSeconds: 0.38,
    frequencyHz,
    staccato: false
  }));
  return [...left, ...right].sort((a, b) => a.offsetSeconds - b.offsetSeconds);
}

export type CancelScheduled = () => void;

/**
 * Emits events with absolute AudioContext times. Timers can wake late without
 * moving the score's time grid. Cancellation also cancels already-created
 * oscillator voices / pending SoundFont note releases.
 */
export class AudioClockQueue {
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private events: readonly TimedTone[] = [];
  private position = 0;
  private origin = 0;
  private cancellations: CancelScheduled[] = [];
  private lastEnd = 0;

  constructor(
    private readonly now: () => number,
    private readonly emit: (tone: TimedTone, absoluteTime: number) => CancelScheduled,
    private readonly lookaheadSeconds = 0.12
  ) {}

  start(events: readonly TimedTone[], leadInSeconds = 0.08): void {
    this.stop();
    if (!events.length) return;
    if (!Number.isFinite(leadInSeconds) || leadInSeconds < 0) throw new Error('Invalid lead-in');
    this.events = [...events].sort((a, b) => a.offsetSeconds - b.offsetSeconds);
    this.origin = this.now() + leadInSeconds;
    this.lastEnd = this.origin + Math.max(...this.events.map(e => e.offsetSeconds + e.durationSeconds));
    this.pump();
    this.tickTimer = setInterval(() => this.pump(), 25);
  }

  pump(): void {
    const current = this.now();
    while (this.position < this.events.length &&
      this.origin + this.events[this.position].offsetSeconds <= current + this.lookaheadSeconds) {
      const event = this.events[this.position++];
      const absoluteTime = this.origin + event.offsetSeconds;
      // If a tab was frozen, never play a compressed burst of stale events.
      if (absoluteTime + event.durationSeconds < current) continue;
      this.cancellations.push(this.emit(event, Math.max(absoluteTime, current)));
    }
    if (this.position === this.events.length && current >= this.lastEnd + 0.1) {
      this.clearTimer();
      this.cancellations = [];
    }
  }

  stop(): void {
    this.clearTimer();
    for (const cancel of this.cancellations) cancel();
    this.cancellations = [];
    this.events = [];
    this.position = 0;
  }

  private clearTimer(): void {
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
}
