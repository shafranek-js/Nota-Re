import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiMessage } from '../src/core/midi/midiMessages.ts';

test('Note On across channels 1 and 16 and original velocity', () => {
  assert.deepEqual(parseMidiMessage([0x90, 60, 104]), { type:'note-on', channel:0, note:60, velocity:104 });
  assert.deepEqual(parseMidiMessage([0x9f, 48, 1]), { type:'note-on', channel:15, note:48, velocity:1 });
});

test('Note Off 0x8n and velocity-zero Note On are releases, never scoring attempts', () => {
  assert.deepEqual(parseMidiMessage([0x82, 60, 64]), { type:'note-off', channel:2, note:60, velocity:64 });
  assert.deepEqual(parseMidiMessage([0x9e, 60, 0]), { type:'note-off', channel:14, note:60, velocity:0 });
});

test('sustain pedal threshold and all-notes-off on any channel', () => {
  assert.deepEqual(parseMidiMessage([0xb4, 64, 63]), { type:'sustain', channel:4, value:63, down:false });
  assert.deepEqual(parseMidiMessage([0xbf, 64, 64]), { type:'sustain', channel:15, value:64, down:true });
  assert.deepEqual(parseMidiMessage([0xb2, 123, 0]), { type:'all-notes-off', channel:2 });
  assert.deepEqual(parseMidiMessage([0xb2, 120, 0]), { type:'all-notes-off', channel:2 });
});

test('ignore unsupported messages and malformed/truncated input safely', () => {
  for (const message of [[], [0x90], [0x91, 62], [0xfe], [0xf8, 0, 0], [0xc0, 8, 0],
    [0xe0, 0, 64], [0xb0, 7, 90], [0x90, 128, 5], [-1, 60, 90], [0x90, 60, 256]]) {
    assert.equal(parseMidiMessage(message), null, JSON.stringify(message));
  }
});
