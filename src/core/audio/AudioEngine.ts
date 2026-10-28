class AudioEngine {
  private ctx: AudioContext | null = null;
  private isAudioEnabled: boolean = true;
  private previewTimeouts: number[] = [];

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
    }
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
