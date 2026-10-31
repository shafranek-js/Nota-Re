import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiOnsets, selectMidiAttacksForAudioClip } from '../scripts/maestro-midi-onsets.mjs';

const varint = value => {
  const bytes = [value & 127];
  while ((value >>= 7) !== 0) bytes.unshift((value & 127) | 128);
  return bytes;
};
const track = events => {
  const data = Buffer.from(events.flat());
  const header = Buffer.alloc(8);
  header.write('MTrk', 0);
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
};
const midi = (tracks, format = tracks.length > 1 ? 1 : 0, division = 480) => {
  const header = Buffer.alloc(14);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(format, 8);
  header.writeUInt16BE(tracks.length, 10);
  header.writeUInt16BE(division, 12);
  return Buffer.concat([header, ...tracks]);
};

test('note-on timestamps follow PPQ; note-off and running status are respected', () => {
  const bytes = midi([track([
    [0, 0x90, 60, 100],
    [...varint(480), 0x80, 60, 0],
    [0, 0x90, 62, 100],
    [...varint(480), 64, 100],
    [0, 0xff, 0x2f, 0]
  ])]);
  assert.deepEqual(parseMidiOnsets(bytes), [
    { midi: 60, onsetMs: 0 }, { midi: 62, onsetMs: 500 },
    { midi: 64, onsetMs: 1000 }
  ]);
});

test('tempo changes from conductor track apply to other tracks', () => {
  const tempo = track([
    [0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20],
    [...varint(480), 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40],
    [0, 0xff, 0x2f, 0]
  ]);
  const notes = track([
    [...varint(480), 0x90, 60, 100],
    [...varint(480), 0x90, 64, 100],
    [0, 0xff, 0x2f, 0]
  ]);
  assert.deepEqual(parseMidiOnsets(midi([tempo, notes])), [
    { midi: 60, onsetMs: 500 }, { midi: 64, onsetMs: 1500 }
  ]);
});

test('select clip-local reference onsets and ignore velocity-zero releases', () => {
  const bytes = midi([track([
    [0, 0x90, 48, 100],
    [...varint(480), 0x90, 48, 0],
    [0, 0x90, 60, 100],
    [...varint(480), 0x90, 67, 100],
    [0, 0xff, 0x2f, 0]
  ])]);
  assert.deepEqual(selectMidiAttacksForAudioClip(parseMidiOnsets(bytes), {
    startMs: 500, durationMs: 500
  }), [{ midi: 60, onsetMs: 0 }]);
});

test('malformed, truncated and SMPTE data cannot be used as ground truth', () => {
  const bytes = midi([track([[0, 0x90, 60, 100]])]);
  assert.throws(() => parseMidiOnsets(bytes.subarray(0, bytes.length - 1)), /Truncated/);
  assert.throws(() => parseMidiOnsets(midi([track([])], 0, 0xe250)), /Only PPQ/);
  assert.throws(() => selectMidiAttacksForAudioClip([], {
    startMs: NaN, durationMs: 100
  }), /Invalid/);
});
