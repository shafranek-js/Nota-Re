import { parseMidiMessage, type MidiInputEvent } from './midiMessages';
import { validatedMidiSystemTime } from './midiEventTiming';

export type MidiDeviceEvent = (MidiInputEvent & {
  receivedAtMs: number;
  /** Browser/OS receipt time, optional. Never a physical key-press timestamp. */
  systemReceivedAtMs?: number;
}) | { type: 'panic' };
type MidiEventCallback = (event: MidiDeviceEvent) => void;
type PortsChangeCallback = (count: number) => void;

/**
 * MIDI hardware transport. In contrast with the old implementation, handles
 * every MIDI channel, Note Off, velocity and CC64. Each port gets exactly one
 * handler, and stale handlers are detached on disconnect or app cleanup.
 */
export class MidiManager {
  private access: WebMidi.MIDIAccess | null = null;
  private pending: Promise<void> | null = null;
  private active = false;
  private handlers = new Map<WebMidi.MIDIInput, (event: WebMidi.MIDIMessageEvent) => void>();
  private eventListeners = new Set<MidiEventCallback>();
  private portListeners = new Set<PortsChangeCallback>();
  private connectedInputsCount = 0;

  public async init(): Promise<void> {
    this.active = true;
    if (this.access) {
      this.attach();
      return;
    }
    if (this.pending) return this.pending;
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return;

    this.pending = (async () => {
      try {
        const access = await navigator.requestMIDIAccess();
        this.access = access;
        if (this.active) this.attach();
      } catch (error) {
        console.warn('Web MIDI unavailable or permission denied', error);
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  private attach(): void {
    if (!this.access || !this.active) return;
    this.access.onstatechange = () => this.attach();
    const current = new Set(this.access.inputs.values());
    let disconnected = false;
    for (const [input, handler] of this.handlers) {
      if (!current.has(input) || input.state === 'disconnected') {
        if (input.onmidimessage === handler) input.onmidimessage = null;
        this.handlers.delete(input);
        disconnected = true;
      }
    }
    if (disconnected) this.broadcast({ type: 'panic' });

    for (const input of current) {
      if (input.state === 'disconnected' || this.handlers.has(input)) continue;
      const handler = (message: WebMidi.MIDIMessageEvent) => {
        if (!this.active || !message.data) return;
        // Same monotonic time origin as performance.now() in AudioEngine.
        // This is a JS callback timestamp, not a physical key-onset time.
        const receivedAtMs = performance.now();
        const systemReceivedAtMs = validatedMidiSystemTime(message.timeStamp, receivedAtMs);
        const parsed = parseMidiMessage(message.data);
        if (parsed) this.broadcast({
          ...parsed, receivedAtMs,
          ...(systemReceivedAtMs === null ? {} : { systemReceivedAtMs })
        });
      };
      input.onmidimessage = handler;
      this.handlers.set(input, handler);
    }
    this.connectedInputsCount = this.handlers.size;
    this.portListeners.forEach(cb => cb(this.connectedInputsCount));
  }

  public dispose(): void {
    this.active = false;
    if (this.access) this.access.onstatechange = null;
    for (const [input, handler] of this.handlers) {
      if (input.onmidimessage === handler) input.onmidimessage = null;
    }
    this.handlers.clear();
    this.connectedInputsCount = 0;
    this.portListeners.forEach(cb => cb(0));
    this.broadcast({ type: 'panic' });
  }

  public getInputsCount(): number {
    return this.connectedInputsCount;
  }

  public onMidiEvent(callback: MidiEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => { this.eventListeners.delete(callback); };
  }

  public onPortsChange(callback: PortsChangeCallback): () => void {
    this.portListeners.add(callback);
    callback(this.connectedInputsCount);
    return () => { this.portListeners.delete(callback); };
  }

  private broadcast(event: MidiDeviceEvent): void {
    for (const callback of this.eventListeners) callback(event);
  }
}

export const midiManager = new MidiManager();
