import type { MidiDeviceEvent } from '../midi/MidiManager';

export interface HardwareCheckSnapshot {
  readonly noteOns: number;
  readonly noteOffs: number;
  readonly maxHeldNotes: number;
  readonly heldNotes: number;
  readonly pedalDownChannels: number;
  readonly sustainPresses: number;
  readonly sustainReleases: number;
  readonly releasesUnderPedal: number;
  readonly panicEvents: number;
  readonly noteLifecyclePassed: boolean;
  readonly polyphonyPassed: boolean;
  readonly sustainPassed: boolean;
  readonly disconnectPanicObserved: boolean;
}

/**
 * A live, local acceptance test, not an audio latency estimate.
 *
 * Only temporary held keys are identified by channel and pitch; snapshots
 * never expose raw pitches, velocities, device identifiers or event times.
 * An unexpected Note Off cannot satisfy a release check.
 */
export class MidiHardwareCheck {
  private heldKeys = new Set<string>();
  private pedalChannels = new Set<number>();
  private releasedWhilePedalDown = new Set<number>();
  private noteOns = 0;
  private noteOffs = 0;
  private maxHeldNotes = 0;
  private sustainPresses = 0;
  private sustainReleases = 0;
  private releasesUnderPedal = 0;
  private panicEvents = 0;
  private lifecycle = false;
  private polyphony = false;
  private sustainCycle = false;
  private panicWithHeldKeys = false;

  accept(event: MidiDeviceEvent): void {
    if (event.type === 'panic') {
      if (this.heldKeys.size > 0) this.panicWithHeldKeys = true;
      this.heldKeys.clear();
      this.pedalChannels.clear();
      this.releasedWhilePedalDown.clear();
      this.panicEvents++;
      return;
    }

    if (event.type === 'note-on') {
      this.noteOns++;
      this.heldKeys.add(event.channel + ':' + event.note);
      this.maxHeldNotes = Math.max(this.maxHeldNotes, this.heldKeys.size);
      if (this.heldKeys.size >= 2) this.polyphony = true;
      return;
    }
    if (event.type === 'note-off') {
      const key = event.channel + ':' + event.note;
      if (!this.heldKeys.delete(key)) return;
      this.noteOffs++;
      this.lifecycle = true;
      if (this.pedalChannels.has(event.channel)) {
        this.releasesUnderPedal++;
        this.releasedWhilePedalDown.add(event.channel);
      }
      return;
    }
    if (event.type === 'sustain') {
      if (event.down) {
        if (!this.pedalChannels.has(event.channel)) this.sustainPresses++;
        this.pedalChannels.add(event.channel);
      } else {
        if (this.pedalChannels.has(event.channel)) {
          this.sustainReleases++;
          if (this.releasedWhilePedalDown.has(event.channel)) this.sustainCycle = true;
        }
        this.pedalChannels.delete(event.channel);
        this.releasedWhilePedalDown.delete(event.channel);
      }
      return;
    }
    if (event.type === 'all-notes-off') {
      for (const key of this.heldKeys) {
        if (key.startsWith(event.channel + ':')) this.heldKeys.delete(key);
      }
      this.pedalChannels.delete(event.channel);
      this.releasedWhilePedalDown.delete(event.channel);
    }
  }

  snapshot(): HardwareCheckSnapshot {
    return {
      noteOns: this.noteOns,
      noteOffs: this.noteOffs,
      maxHeldNotes: this.maxHeldNotes,
      heldNotes: this.heldKeys.size,
      pedalDownChannels: this.pedalChannels.size,
      sustainPresses: this.sustainPresses,
      sustainReleases: this.sustainReleases,
      releasesUnderPedal: this.releasesUnderPedal,
      panicEvents: this.panicEvents,
      noteLifecyclePassed: this.lifecycle,
      polyphonyPassed: this.polyphony,
      sustainPassed: this.sustainCycle,
      disconnectPanicObserved: this.panicWithHeldKeys
    };
  }

  reset(): void {
    this.heldKeys.clear();
    this.pedalChannels.clear();
    this.releasedWhilePedalDown.clear();
    this.noteOns = 0;
    this.noteOffs = 0;
    this.maxHeldNotes = 0;
    this.sustainPresses = 0;
    this.sustainReleases = 0;
    this.releasesUnderPedal = 0;
    this.panicEvents = 0;
    this.lifecycle = false;
    this.polyphony = false;
    this.sustainCycle = false;
    this.panicWithHeldKeys = false;
  }
}

export function makeHardwareCheckReport(
  snapshot: HardwareCheckSnapshot,
  audio: {
    samples: number;
    medianDispatchMs: number | null;
    p95DispatchMs: number | null;
    baseLatencyMs: number | null;
    outputLatencyMs: number | null;
    soundFontCount: number;
    oscillatorCount: number;
  }
): string {
  return JSON.stringify({
    format: 'nota-re-midi-hardware-check-v1',
    checks: {
      keyPressAndRelease: snapshot.noteLifecyclePassed,
      twoSimultaneousNotes: snapshot.polyphonyPassed,
      pedalSustainRelease: snapshot.sustainPassed,
      disconnectWhileHoldingNotes: snapshot.disconnectPanicObserved
    },
    aggregate: {
      noteOns: snapshot.noteOns,
      noteOffs: snapshot.noteOffs,
      peakHeldKeys: snapshot.maxHeldNotes,
      sustainPresses: snapshot.sustainPresses,
      sustainReleases: snapshot.sustainReleases,
      releasesUnderPedal: snapshot.releasesUnderPedal,
      panicEvents: snapshot.panicEvents,
      heldKeysAtStop: snapshot.heldNotes,
      channelsWithPedalDownAtStop: snapshot.pedalDownChannels
    },
    midiToAudioDispatch: {
      samples: audio.samples,
      medianMs: audio.medianDispatchMs,
      p95Ms: audio.p95DispatchMs,
      soundFontCount: audio.soundFontCount,
      oscillatorCount: audio.oscillatorCount
    },
    browserAudioEstimates: {
      baseLatencyMs: audio.baseLatencyMs,
      outputLatencyMs: audio.outputLatencyMs
    },
    limitations: 'Browser-generated MIDI events and API latency estimates are not an acoustic key-to-speaker measurement. Disconnect test requires actual disconnection.'
  }, null, 2);
}
