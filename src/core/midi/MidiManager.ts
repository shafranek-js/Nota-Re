import { MIDI_NOTE_MAP } from '../../data/notes';

type MidiNoteCallback = (noteName: string) => void;
type PortsChangeCallback = (count: number) => void;

class MidiManager {
  private midiAccess: WebMidi.MIDIAccess | null = null;
  private noteListeners: Set<MidiNoteCallback> = new Set();
  private portListeners: Set<PortsChangeCallback> = new Set();
  private connectedInputsCount: number = 0;

  public async init(): Promise<void> {
    if (!navigator.requestMIDIAccess) return;

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.updatePorts();
      this.midiAccess.onstatechange = () => this.updatePorts();
    } catch {
      // MIDI access denied or unavailable
    }
  }

  private updatePorts(): void {
    if (!this.midiAccess) return;
    const inputs = Array.from(this.midiAccess.inputs.values());
    this.connectedInputsCount = inputs.length;
    this.portListeners.forEach(cb => cb(this.connectedInputsCount));

    inputs.forEach(input => {
      input.onmidimessage = (msg) => {
        if (!msg.data) return;
        const [cmd, midiNote, velocity] = msg.data;
        // 144 = NoteOn, velocity > 0
        if (cmd === 144 && velocity > 0) {
          const found = Object.entries(MIDI_NOTE_MAP).find(([, v]) => v.midi === midiNote);
          if (found) {
            this.notifyNote(found[0]);
          }
        }
      };
    });
  }

  public getInputsCount(): number {
    return this.connectedInputsCount;
  }

  public onNoteTrigger(cb: MidiNoteCallback): () => void {
    this.noteListeners.add(cb);
    return () => this.noteListeners.delete(cb);
  }

  public onPortsChange(cb: PortsChangeCallback): () => void {
    this.portListeners.add(cb);
    cb(this.connectedInputsCount);
    return () => this.portListeners.delete(cb);
  }

  private notifyNote(noteName: string): void {
    this.noteListeners.forEach(cb => cb(noteName));
  }
}

export const midiManager = new MidiManager();
