import { SoundFontPiano, type PianoOutput, type SoundFontStatus } from './SoundFontPiano';
import {
  AudioClockQueue, articulationTimeline, sequenceTimeline, syllableTimeline,
  type TimedTone
} from './audioTimeline';

interface LiveMidiVoice {
  kind: 'soundfont' | 'oscillator';
  oscillator?: OscillatorNode;
  gain?: GainNode;
  released: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isAudioEnabled: boolean = true;
  private previewQueue: AudioClockQueue | null = null;
  private activeMetronomeStops = new Set<() => void>();
  private piano = new SoundFontPiano();
  private liveVoices = new Map<string, LiveMidiVoice>();
  private sustainChannels = new Set<number>();

  public getSoundFontStatus(): SoundFontStatus { return this.piano.getStatus(); }
  public subscribeSoundFont(callback: (status: SoundFontStatus) => void): () => void {
    return this.piano.subscribe(callback);
  }
  public setPianoOutput(output: PianoOutput): void {
    this.clearPreviewTimeouts();
    this.stopMidiVoices();
    this.piano.setOutput(output);
  }
  public async prepareSoundFont(retry = false): Promise<void> {
    const context = this.ensureAudioContext();
    if (context) await this.piano.prepare(context, retry);
  }
  public async importCustomSoundFont(file: File): Promise<void> {
    const context = this.ensureAudioContext();
    if (!context) throw new Error('Web Audio is not supported in this browser.');
    this.clearPreviewTimeouts();
    this.stopMidiVoices();
    await this.piano.importCustom(file, context);
    this.piano.setOutput('soundfont');
  }
  public async selectBuiltInSoundFont(): Promise<void> {
    const context = this.ensureAudioContext();
    if (!context) throw new Error('Web Audio is not supported in this browser.');
    this.clearPreviewTimeouts();
    this.stopMidiVoices();
    await this.piano.useBuiltIn(context);
    this.piano.setOutput('soundfont');
  }

  public ensureAudioContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** Null until Web Audio has been created through a user gesture. */
  public currentAudioTime(): number | null {
    return this.ctx?.currentTime ?? null;
  }

  public setAudioEnabled(enabled: boolean): void {
    this.isAudioEnabled = enabled;
    if (!enabled) {
      this.clearPreviewTimeouts();
      this.stopScheduledMetronome();
      this.stopMidiVoices();
    }
  }

  /**
   * Real held-key MIDI lifecycle. Handles full 0..127 pitch range even though
   * lesson scoring currently knows only the narrower training note map.
   * While SoundFont loads, a live oscillator voice remains held until release.
   */
  public midiNoteOn(channel: number, note: number, velocity: number): void {
    if (!this.isAudioEnabled) return;
    if (channel < 0 || channel > 15 || note < 0 || note > 127 || velocity < 1 || velocity > 127) return;
    const context = this.ensureAudioContext();
    if (!context) return;
    const key = channel + ':' + note;
    const previous = this.liveVoices.get(key);
    if (previous) {
      this.releaseLiveVoice(channel, note, previous, true);
      this.liveVoices.delete(key);
    }

    if (this.sustainChannels.has(channel)) this.piano.sustain(channel, 127);
    if (this.piano.noteOn(context, channel, note, velocity)) {
      this.liveVoices.set(key, { kind: 'soundfont', released: false });
      return;
    }

    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(440 * Math.pow(2, (note - 69) / 12), now);
      // Velocity changes actual audio volume, not just the scoring value.
      const amplitude = 0.04 + 0.28 * (velocity / 127) ** 2;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(amplitude, now + 0.012);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now);
      this.liveVoices.set(key, { kind: 'oscillator', oscillator, gain, released: false });
    } catch (error) {
      console.warn('Cannot create MIDI fallback voice', error);
    }
  }

  private releaseLiveVoice(channel: number, note: number, voice: LiveMidiVoice, force = false): void {
    if (voice.kind === 'soundfont') {
      this.piano.noteOff(channel, note);
      return;
    }
    if (!voice.oscillator || !voice.gain) return;
    const now = this.ctx?.currentTime ?? 0;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.linearRampToValueAtTime(0.0001, now + (force ? 0.008 : 0.08));
      voice.oscillator.stop(now + (force ? 0.01 : 0.09));
    } catch { /* the voice may already have ended */ }
  }

  public midiNoteOff(channel: number, note: number): void {
    const key = channel + ':' + note;
    const voice = this.liveVoices.get(key);
    if (!voice || voice.released) return;
    voice.released = true;
    // SoundFont manages sustain natively; always send the physical key release.
    if (voice.kind === 'soundfont') {
      this.releaseLiveVoice(channel, note, voice);
      this.liveVoices.delete(key);
    } else if (!this.sustainChannels.has(channel)) {
      this.releaseLiveVoice(channel, note, voice);
      this.liveVoices.delete(key);
    }
  }

  public midiSustain(channel: number, value: number): void {
    if (value >= 64) this.sustainChannels.add(channel);
    else this.sustainChannels.delete(channel);
    this.piano.sustain(channel, value);

    if (value < 64) {
      for (const [key, voice] of this.liveVoices) {
        if (key.startsWith(channel + ':') && voice.kind === 'oscillator' && voice.released) {
          this.releaseLiveVoice(channel, Number(key.split(':')[1]), voice);
          this.liveVoices.delete(key);
        }
      }
    }
  }

  public midiAllNotesOff(channel: number): void {
    this.sustainChannels.delete(channel);
    this.piano.allNotesOff(channel);
    for (const [key, voice] of this.liveVoices) {
      if (!key.startsWith(channel + ':')) continue;
      this.releaseLiveVoice(channel, Number(key.split(':')[1]), voice, true);
      this.liveVoices.delete(key);
    }
  }

  public stopMidiVoices(): void {
    for (const [key, voice] of this.liveVoices) {
      const [channel, note] = key.split(':').map(Number);
      this.releaseLiveVoice(channel, note, voice, true);
    }
    this.liveVoices.clear();
    this.sustainChannels.clear();
    this.piano.stopAll();
  }

  public getAudioEnabled(): boolean {
    return this.isAudioEnabled;
  }

  /**
   * Public API name is kept for callers, but no preview event relies on
   * setTimeout anymore. Stop both imminent worklet events and WebAudio nodes.
   */
  public clearPreviewTimeouts(): void {
    this.previewQueue?.stop();
    this.previewQueue = null;
  }

  private scheduleFallbackPreview(
    context: AudioContext, tone: TimedTone, when: number
  ): () => void {
    const oscillators: OscillatorNode[] = [];
    const voices: { oscillator: OscillatorNode; gain: GainNode }[] = [];
    const startAt = Math.max(context.currentTime, when);
    const duration = Math.max(0.025, tone.durationSeconds);
    for (const [harmonic, volume] of [[1, 0.28], [2, 0.06]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = harmonic === 1 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(tone.frequencyHz * harmonic, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.04);
      oscillators.push(oscillator);
      voices.push({ oscillator, gain });
    }
    return () => {
      for (const voice of voices) {
        try {
          const now = context.currentTime;
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(0.0001, now);
          voice.oscillator.stop(now + 0.005);
        } catch { /* already released */ }
      }
      oscillators.length = 0;
    };
  }

  private playTimeline(events: readonly TimedTone[]): void {
    this.clearPreviewTimeouts();
    if (!this.isAudioEnabled || !events.length) return;
    const context = this.ensureAudioContext();
    if (!context) return;
    // Use one timbre for an entire preview even when the bank completes
    // loading halfway through it.
    const sampleReady = this.piano.getStatus().phase === 'ready' &&
      this.piano.getStatus().output === 'soundfont';
    const queue = new AudioClockQueue(
      () => context.currentTime,
      (tone, time) => {
        if (sampleReady) {
          const cancel = this.piano.schedulePreviewNote(context, tone.frequencyHz, tone.durationSeconds, time);
          if (cancel) return cancel;
        } else if (this.piano.getStatus().output === 'soundfont') {
          void this.piano.prepare(context);
        }
        return this.scheduleFallbackPreview(context, tone, time);
      }
    );
    this.previewQueue = queue;
    queue.start(events);
  }

  public playPianoTone(freq: number, duration: number = 0.55, isStaccato: boolean = false): void {
    if (!this.isAudioEnabled) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    // A missing/loading/failed SoundFont never silences training: fall back
    // to the original oscillator without blocking a single note.
    if (this.piano.play(ctx, freq, duration, isStaccato)) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const actualDur = isStaccato ? 0.12 : duration;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + actualDur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + actualDur + 0.05);

      // Легкий тёплый обертон для реалистичности
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(freq * 2, now);
      overtoneGain.gain.setValueAtTime(0.0001, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + actualDur * 0.7);

      overtone.connect(overtoneGain);
      overtoneGain.connect(ctx.destination);
      overtone.start(now);
      overtone.stop(now + actualDur * 0.7 + 0.05);
    } catch {
      // Audio error silently caught
    }
  }

  /**
   * Actual click onset is scheduled on the AudioContext clock. The returned
   * cancel callback only affects this click, not live MIDI or preview voices.
   */
  public scheduleMetronomeClick(isStrong = false, at?: number): () => void {
    if (!this.isAudioEnabled) return () => {};
    const context = this.ensureAudioContext();
    if (!context) return () => {};
    const time = Math.max(at ?? context.currentTime, context.currentTime);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(isStrong ? 1046.5 : 784, time);
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const cancel = () => {
      this.activeMetronomeStops.delete(cancel);
      try {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.0001, now);
        oscillator.stop(now + 0.005);
      } catch { /* click already finished */ }
    };
    oscillator.onended = () => {
      this.activeMetronomeStops.delete(cancel);
      oscillator.disconnect();
      gain.disconnect();
    };
    this.activeMetronomeStops.add(cancel);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
    return cancel;
  }

  public stopScheduledMetronome(): void {
    for (const cancel of [...this.activeMetronomeStops]) cancel();
  }

  public playMetronomeClick(isStrong = false): void {
    this.scheduleMetronomeClick(isStrong);
  }

  public playSyllablePatternDemo(type: 'ta' | 'titi' | 'tiritiri' | 'taa', bpm = 60): void {
    this.playTimeline(syllableTimeline(type, bpm));
  }

  public playArticulationDemo(bpm = 60): void {
    this.playTimeline(articulationTimeline(bpm));
  }

  public playSequence(notes: {
    freq: number;
    durMultiplier?: number;
    articulation?: 'legato' | 'staccato';
  }[], bpm = 60): void {
    this.playTimeline(sequenceTimeline(notes, bpm));
  }
}

export const audioEngine = new AudioEngine();
