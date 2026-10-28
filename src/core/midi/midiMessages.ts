/**
 * MIDI channel voice messages are 0x8n / 0x9n / 0xBn, for channels 0..15.
 * 0x90 with velocity 0 is Note Off; other system / channel messages are
 * deliberately ignored. Pure parser used by both MIDI I/O and unit tests.
 */
export type MidiInputEvent =
  | { type: 'note-on'; channel: number; note: number; velocity: number }
  | { type: 'note-off'; channel: number; note: number; velocity: number }
  | { type: 'sustain'; channel: number; value: number; down: boolean }
  | { type: 'all-notes-off'; channel: number };

export function parseMidiMessage(data: ArrayLike<number>): MidiInputEvent | null {
  if (data.length < 3) return null;
  const status = data[0];
  const first = data[1];
  const second = data[2];
  if (![status, first, second].every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return null;
  }
  if (status < 0x80 || status > 0xef || first > 127 || second > 127) return null;
  const command = status & 0xf0;
  const channel = status & 0x0f;
  if (command === 0x90) {
    return second === 0
      ? { type: 'note-off', channel, note: first, velocity: 0 }
      : { type: 'note-on', channel, note: first, velocity: second };
  }
  if (command === 0x80) return { type: 'note-off', channel, note: first, velocity: second };
  if (command === 0xb0) {
    if (first === 64) return { type: 'sustain', channel, value: second, down: second >= 64 };
    if (first === 120 || first === 123) return { type: 'all-notes-off', channel };
  }
  return null;
}
