import type { WorkletSynthesizer } from 'spessasynth_lib';
import {
  BUILTIN_SOUNDFONT_NAME,
  loadBuiltInBank,
  loadCustomBank,
  saveCustomBank,
  validateCustomBank,
  workletUrl
} from './soundfontBank.ts';

export type PianoOutput = 'soundfont' | 'oscillator';
export type SoundFontPhase = 'idle' | 'loading' | 'ready' | 'error';
export type SoundFontSource = 'builtin' | 'custom';

export interface SoundFontStatus {
  output: PianoOutput;
  phase: SoundFontPhase;
  source: SoundFontSource;
  bankName: string;
  error: string | null;
}

const OUTPUT_KEY = 'notare-piano-output-v1';
const SOURCE_KEY = 'notare-piano-bank-source-v1';

function savedOutput(): PianoOutput {
  try { return localStorage.getItem(OUTPUT_KEY) === 'oscillator' ? 'oscillator' : 'soundfont'; }
  catch { return 'soundfont'; }
}
function savedSource(): SoundFontSource {
  try { return localStorage.getItem(SOURCE_KEY) === 'custom' ? 'custom' : 'builtin'; }
  catch { return 'builtin'; }
}
function savePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private browsing */ }
}

/**
 * Single SoundFont synth adapter. No synth is built until user-initiated audio
 * playback or an explicit settings action. The old WebAudio oscillator remains
 * available while the bank is preparing or when it cannot be loaded.
 */
export class SoundFontPiano {
  private synth: WorkletSynthesizer | null = null;
  private context: AudioContext | null = null;
  private generation = 0;
  private loading: Promise<void> | null = null;
  private status: SoundFontStatus = {
    output: savedOutput(), phase: 'idle', source: savedSource(),
    bankName: BUILTIN_SOUNDFONT_NAME, error: null
  };
  private listeners = new Set<(status: SoundFontStatus) => void>();
  private releaseTimers = new Set<number>();

  getStatus(): SoundFontStatus { return { ...this.status }; }

  subscribe(listener: (status: SoundFontStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => { this.listeners.delete(listener); };
  }

  private report(patch: Partial<SoundFontStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.getStatus());
  }

  setOutput(output: PianoOutput): void {
    if (this.status.output === output) return;
    this.report({ output });
    savePreference(OUTPUT_KEY, output);
    if (output === 'oscillator') this.stopAll();
  }

  stopAll(): void {
    for (const timer of this.releaseTimers) clearTimeout(timer);
    this.releaseTimers.clear();
    this.synth?.stopAll(true);
  }

  /**
   * Starts bank preparation on demand. Call during a user audio gesture so the
   * shared AudioContext is allowed to resume.
   */
  prepare(context: AudioContext, retry = false): Promise<void> {
    if (this.status.output !== 'soundfont') return Promise.resolve();
    if (this.synth && this.status.phase === 'ready') return Promise.resolve();
    if (this.loading) return this.loading;
    if (this.status.phase === 'error' && !retry) return Promise.resolve();
    const generation = ++this.generation;
    this.context = context;
    const source = this.status.source;
    this.report({ phase: 'loading', error: null });
    const work = (async () => {
      try {
        let data: ArrayBuffer;
        let name = BUILTIN_SOUNDFONT_NAME;
        if (source === 'custom') {
          const saved = await loadCustomBank();
          if (!saved) throw new Error('Custom SoundFont missing from local storage.');
          name = saved.filename;
          data = await saved.blob.arrayBuffer();
        } else {
          data = await loadBuiltInBank();
        }
        await this.activate(data, context, generation);
        if (this.generation !== generation) return;
        this.report({ phase: 'ready', bankName: name, error: null });
      } catch (error) {
        if (this.generation !== generation) return;
        // If the chosen custom bank was deleted, make the default available
        // on explicit re-selection; never report custom as successfully loaded.
        this.report({ phase: 'error',
          error: error instanceof Error ? error.message : String(error) });
        console.error('SoundFont unavailable; oscillator fallback active', error);
      }
    })();
    this.loading = work.finally(() => {
      if (this.generation === generation) this.loading = null;
    });
    return this.loading;
  }

  private async waitForChannels(synth: WorkletSynthesizer, count: number): Promise<void> {
    const expires = performance.now() + 3000;
    while (synth.midiChannels.length < count) {
      if (performance.now() > expires) {
        throw new Error('SoundFont worklet did not initialize its MIDI channels.');
      }
      await new Promise<void>(resolve => setTimeout(resolve, 15));
    }
  }

  private async activate(data: ArrayBuffer, context: AudioContext, generation: number): Promise<void> {
    if (this.generation !== generation) return;
    await context.audioWorklet.addModule(workletUrl());
    if (this.generation !== generation) return;
    const { WorkletSynthesizer: Synth } = await import('spessasynth_lib');
    if (this.generation !== generation) return;
    const next = new Synth(context);
    try {
      await next.soundBankManager.addSoundBank(data, 'main');
      await next.isReady;
      await this.waitForChannels(next, 16);
      if (this.generation !== generation) { next.destroy(); return; }
      // Keep acoustic piano selected on melodic channels. GM channel 10
      // (zero-based 9) remains percussion by standard convention.
      for (let channel = 0; channel < 16; channel++) {
        if (channel !== 9) next.programChange(channel, 0);
      }
      // Keep reference/demo playback on its own virtual channel; it must
      // never steal or silence the physical MIDI controller's 16 channels.
      next.addNewChannel();
      await this.waitForChannels(next, 17);
      if (this.generation !== generation) { next.destroy(); return; }
      next.programChange(16, 0);
      const previous = this.synth;
      this.stopAll();
      this.synth = next;
      previous?.destroy();
    } catch (error) {
      next.destroy();
      throw error;
    }
  }

  /**
   * Only commits the bank switch after it can be parsed and prepared. A saved
   * user file remains in IndexedDB, not in localStorage or a remote server.
   */
  async importCustom(file: File, context: AudioContext): Promise<void> {
    const data = await validateCustomBank(file);
    const generation = ++this.generation;
    this.loading = null;
    this.report({ phase: 'loading', error: null });
    try {
      await this.activate(data, context, generation);
      if (this.generation !== generation) return;
      await saveCustomBank(file);
      this.report({ source: 'custom', bankName: file.name, phase: 'ready', error: null });
      savePreference(SOURCE_KEY, 'custom');
    } catch (error) {
      if (this.generation === generation) {
        this.report({ phase: this.synth ? 'ready' : 'error',
          error: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  }

  async useBuiltIn(context: AudioContext): Promise<void> {
    if (this.status.source === 'builtin' && this.status.phase === 'ready') return;
    const generation = ++this.generation;
    this.loading = null;
    this.report({ phase: 'loading', error: null });
    try {
      const data = await loadBuiltInBank();
      await this.activate(data, context, generation);
      if (this.generation !== generation) return;
      this.report({ source: 'builtin', bankName: BUILTIN_SOUNDFONT_NAME,
        phase: 'ready', error: null });
      savePreference(SOURCE_KEY, 'builtin');
    } catch (error) {
      if (this.generation === generation) {
        this.report({ phase: this.synth ? 'ready' : 'error',
          error: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  }

  /**
   * Live MIDI notes are held until the physical Note Off. Unlike the existing
   * lesson preview they do not use a hard-coded timer or fixed velocity.
   */
  noteOn(context: AudioContext, channel: number, note: number, velocity: number): boolean {
    if (this.status.output !== 'soundfont') return false;
    if (!this.synth || this.status.phase !== 'ready') {
      void this.prepare(context);
      return false;
    }
    this.synth.noteOn(channel, note, velocity);
    return true;
  }

  noteOff(channel: number, note: number): void {
    if (this.synth && this.status.output === 'soundfont') {
      this.synth.noteOff(channel, note);
    }
  }

  sustain(channel: number, value: number): void {
    if (this.synth && this.status.output === 'soundfont') {
      this.synth.controllerChange(channel, 64, value);
    }
  }

  allNotesOff(channel: number): void {
    if (this.synth && this.status.output === 'soundfont') {
      this.synth.controllerChange(channel, 64, 0);
      this.synth.controllerChange(channel, 123, 0);
    }
  }

  /**
   * Worklet events accept AudioContext timestamps, so sample attacks and
   * releases remain on the musical grid even if JS wakeups are uneven.
   * Channel 16 is reserved for previews (hardware occupies channels 0..15).
   * The caller schedules only a short lookahead, so cancellation cannot
   * enqueue seconds of future audio.
   */
  schedulePreviewNote(
    context: AudioContext, frequencyHz: number,
    durationSeconds: number, when: number
  ): (() => void) | null {
    if (this.status.output !== 'soundfont' || !this.synth || this.status.phase !== 'ready') {
      if (this.status.output === 'soundfont') void this.prepare(context);
      return null;
    }
    const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
    const synth = this.synth;
    const startAt = Math.max(when, context.currentTime);
    synth.noteOn(16, midi, 100, { time: startAt });
    synth.noteOff(16, midi, { time: startAt + Math.max(0.02, durationSeconds) });
    return () => {
      if (this.synth !== synth) return;
      // Cancel currently playing previews and any imminent lookahead events.
      synth.noteOff(16, midi, { time: Math.max(context.currentTime, startAt + 0.005) });
    };
  }

  play(context: AudioContext, frequencyHz: number, durationSeconds: number,
    staccato = false, velocity = 100): boolean {
    if (this.status.output !== 'soundfont') return false;
    if (!this.synth || this.status.phase !== 'ready') {
      void this.prepare(context);
      return false;
    }
    const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) return false;
    const timeMs = Math.max(30, 1000 * (staccato ? 0.12 : durationSeconds));
    const synth = this.synth;
    synth.noteOn(0, midi, Math.max(1, Math.min(127, Math.round(velocity))));
    const timer = window.setTimeout(() => {
      this.releaseTimers.delete(timer);
      if (this.synth === synth) synth.noteOff(0, midi);
    }, timeMs);
    this.releaseTimers.add(timer);
    return true;
  }
}
