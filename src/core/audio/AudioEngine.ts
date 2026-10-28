import { SoundFontPiano, type PianoOutput, type SoundFontStatus } from './SoundFontPiano';

interface LiveMidiVoice {
  kind: 'soundfont' | 'oscillator';
  oscillator?: OscillatorNode;
  gain?: GainNode;
  released: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isAudioEnabled: boolean = true;
  private previewTimeouts: number[] = [];
  private piano = new SoundFontPiano();
  private liveVoices = new Map<string, LiveMidiVoice>();
  private sustainChannels = new Set<number>();

  public getSoundFontStatus(): SoundFontStatus { return this.piano.getStatus(); }
  public subscribeSoundFont(callback: (status: SoundFontStatus) => void): () => void {
    return this.piano.subscribe(callback);
  }
  public setPianoOutput(output: PianoOutput): void {
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
    this.stopMidiVoices();
    await this.piano.importCustom(file, context);
    this.piano.setOutput('soundfont');
  }
  public async selectBuiltInSoundFont(): Promise<void> {
    const context = this.ensureAudioContext();
    if (!context) throw new Error('Web Audio is not supported in this browser.');
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

  public setAudioEnabled(enabled: boolean): void {
    this.isAudioEnabled = enabled;
    if (!enabled) {
      this.clearPreviewTimeouts();
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

  public clearPreviewTimeouts(): void {
    this.previewTimeouts.forEach(id => clearTimeout(id));
    this.previewTimeouts = [];
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

  public playMetronomeClick(isStrong: boolean = false): void {
    if (!this.isAudioEnabled) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isStrong ? 1046.5 : 784.0, now); // C6 : G5

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio error silently caught
    }
  }

  public playSyllablePatternDemo(type: 'ta' | 'titi' | 'tiritiri' | 'taa', bpm: number = 60): void {
    this.clearPreviewTimeouts();
    this.ensureAudioContext();
    const beatMs = (60 / bpm) * 1000;
    const toneFreq = 392.00; // G4

    if (type === 'ta') {
      for (let i = 0; i < 4; i++) {
        const tid = window.setTimeout(() => this.playPianoTone(toneFreq, 0.4), i * beatMs);
        this.previewTimeouts.push(tid);
      }
    } else if (type === 'titi') {
      const pattern = [0, 0.5, 1, 2, 2.5, 3];
      pattern.forEach(b => {
        const tid = window.setTimeout(() => this.playPianoTone(toneFreq, 0.22), b * beatMs);
        this.previewTimeouts.push(tid);
      });
    } else if (type === 'tiritiri') {
      const pattern = [0, 0.25, 0.5, 0.75, 1, 2, 2.25, 2.5, 2.75, 3];
      pattern.forEach(b => {
        const tid = window.setTimeout(() => this.playPianoTone(toneFreq, 0.12), b * beatMs);
        this.previewTimeouts.push(tid);
      });
    } else if (type === 'taa') {
      const tid1 = window.setTimeout(() => this.playPianoTone(toneFreq, 1.2), 0);
      const tid2 = window.setTimeout(() => this.playPianoTone(toneFreq, 0.4), 2 * beatMs);
      const tid3 = window.setTimeout(() => this.playPianoTone(toneFreq, 0.4), 3 * beatMs);
      this.previewTimeouts.push(tid1, tid2, tid3);
    }
  }

  public playArticulationDemo(bpm: number = 60): void {
    this.clearPreviewTimeouts();
    this.ensureAudioContext();
    const beatMs = (60 / bpm) * 1000;

    // Левая рука: басы стаккато
    [0, 1, 2, 3].forEach(b => {
      const tid = window.setTimeout(() => {
        this.playPianoTone(130.81, 0.15, true); // C3
      }, b * beatMs);
      this.previewTimeouts.push(tid);
    });

    // Правая рука: мелодия легато восьмыми
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((b, idx) => {
      const freqs = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
      const tid = window.setTimeout(() => {
        this.playPianoTone(freqs[idx % freqs.length], 0.38, false);
      }, b * beatMs);
      this.previewTimeouts.push(tid);
    });
  }

  public playSequence(notes: { freq: number; durMultiplier?: number; articulation?: 'legato' | 'staccato' }[], bpm: number = 60): void {
    this.clearPreviewTimeouts();
    this.ensureAudioContext();
    const beatMs = (60 / bpm) * 1000;

    let accumTime = 0;
    notes.forEach(note => {
      const durSec = (note.durMultiplier || 1) * (60 / bpm);
      const tid = window.setTimeout(() => {
        this.playPianoTone(note.freq, durSec * 0.9, note.articulation === 'staccato');
      }, accumTime * 1000);
      this.previewTimeouts.push(tid);
      accumTime += durSec;
    });
  }
}

export const audioEngine = new AudioEngine();
