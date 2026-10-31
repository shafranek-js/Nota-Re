import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiOnsets, parseMidiReference, selectMidiAttacksForAudioClip } from '../scripts/maestro-midi-onsets.mjs';

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

test('CC64 is channel-scoped, tempo-aware, and never counted as a note attack', () => {
  const tempoTrack = track([
    [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20],
    [...varint(480), 0xff, 0x51, 3, 0x0f, 0x42, 0x40],
    [0, 0xff, 0x2f, 0]
  ]);
  const piano = track([
    [0, 0x90, 60, 100],
    [...varint(240), 0xb0, 64, 127],
    [...varint(240), 0x90, 62, 100],
    [0, 0x90, 74, 100],
    [0, 0x91, 67, 100], // different MIDI channel: no independent CC64
    [...varint(480), 0xb0, 64, 63],
    [0, 0x90, 64, 100],
    [...varint(480), 0x90, 65, 100],
    [0, 0xff, 0x2f, 0]
  ]);
  const bytes = midi([tempoTrack, piano]);
  const ref = parseMidiReference(bytes);
  assert.deepEqual(ref.pedalChanges, [
    { onsetMs: 250, value: 127, channel: 0 },
    { onsetMs: 1500, value: 63, channel: 0 }
  ]);
  assert.deepEqual(ref.attacks, [
    { midi: 60, onsetMs: 0, pedalDownAtOnset: false },
    { midi: 62, onsetMs: 500, pedalDownAtOnset: true },
    { midi: 74, onsetMs: 500, pedalDownAtOnset: true },
    { midi: 67, onsetMs: 500, pedalDownAtOnset: null },
    { midi: 64, onsetMs: 1500, pedalDownAtOnset: false },
    { midi: 65, onsetMs: 2500, pedalDownAtOnset: false }
  ]);
  assert.deepEqual(parseMidiOnsets(bytes), ref.attacks.map(({ midi, onsetMs }) => ({ midi, onsetMs })));
  assert.deepEqual(selectMidiAttacksForAudioClip(ref.attacks, {
    startMs: 500, durationMs: 1100
  }), [
    { midi: 62, onsetMs: 0, pedalDownAtOnset: true },
    { midi: 74, onsetMs: 0, pedalDownAtOnset: true },
    { midi: 67, onsetMs: 0, pedalDownAtOnset: null },
    { midi: 64, onsetMs: 1000, pedalDownAtOnset: false }
  ]);
});

test('missing CC64 stays unknown and invalid CC64 message is rejected', () => {
  const notesOnly = midi([track([
    [0, 0x90, 60, 100], [0, 0xff, 0x2f, 0]
  ])]);
  assert.equal(parseMidiReference(notesOnly).attacks[0].pedalDownAtOnset, null);
  const malformedCc = midi([track([[0, 0xb0, 64, 128]])]);
  assert.throws(() => parseMidiReference(malformedCc), /Invalid MIDI data byte/);
});

test('release-aware MIDI preserves Note Off, velocity-zero release and pedal control end', () => {
  const bytes = midi([track([
    [0, 0x90, 60, 98],
    [...varint(120), 0xb0, 64, 127],
    [...varint(120), 0x80, 60, 25],
    [...varint(240), 0x90, 62, 100],
    [...varint(120), 0xb0, 64, 0],
    [...varint(120), 0x90, 62, 0],
    [0, 0xff, 0x2f, 0]
  ])]);
  const old = parseMidiReference(bytes);
  assert.deepEqual(old.attacks, [
    { midi: 60, onsetMs: 0, pedalDownAtOnset: false },
    { midi: 62, onsetMs: 500, pedalDownAtOnset: true }
  ], 'existing call shape is unchanged for legacy consumers');
  const ref = parseMidiReference(bytes, { withReleases: true });
  assert.deepEqual(ref.attacks, [
    { midi: 60, onsetMs: 0, pedalDownAtOnset: false,
      keyReleaseMs: 250, midiControlEndMs: 625, pedalHeldAfterRelease: true,
      ambiguousRelease: false },
    { midi: 62, onsetMs: 500, pedalDownAtOnset: true,
      keyReleaseMs: 750, midiControlEndMs: 750, pedalHeldAfterRelease: false,
      ambiguousRelease: false }
  ]);
  assert.equal(ref.unmatchedNoteOffs, 0);
  assert.deepEqual(parseMidiOnsets(bytes), [
    { midi: 60, onsetMs: 0 }, { midi: 62, onsetMs: 500 }
  ]);
  assert.deepEqual(selectMidiAttacksForAudioClip(ref.attacks, {
    startMs: 200, durationMs: 400
  }), [
    { midi: 62, onsetMs: 300, pedalDownAtOnset: true,
      keyReleaseMs: 550, midiControlEndMs: 550, pedalHeldAfterRelease: false,
      ambiguousRelease: false }
  ], 'control release after a short excerpt is retained as MIDI provenance');
});

test('same-pitch overlapping key-down is flagged rather than confidently attributed', () => {
  const ref = parseMidiReference(midi([track([
    [0, 0x90, 60, 80],
    [...varint(120), 0x90, 60, 90],
    [...varint(120), 0x80, 60, 0],
    [...varint(120), 0x80, 60, 0],
    [0, 0xff, 0x2f, 0]
  ])]), { withReleases: true });
  assert.equal(ref.attacks.length, 2);
  assert.equal(ref.attacks[0].ambiguousRelease, true);
  assert.equal(ref.attacks[1].ambiguousRelease, true);
  assert.equal(ref.attacks[0].keyReleaseMs, 250);
  assert.equal(ref.attacks[1].keyReleaseMs, 375);
});

test('CC64 unavailable and unmatched/unfinished releases remain explicitly censored', () => {
  const ref = parseMidiReference(midi([track([
    [0, 0x80, 70, 0],
    [0, 0x90, 60, 100],
    [...varint(480), 0x80, 60, 0],
    [0, 0x90, 62, 100],
    [0, 0xff, 0x2f, 0]
  ])]), { withReleases: true });
  assert.equal(ref.unmatchedNoteOffs, 1);
  assert.equal(ref.attacks[0].keyReleaseMs, 500);
  assert.equal(ref.attacks[0].pedalHeldAfterRelease, null);
  assert.equal(ref.attacks[0].midiControlEndMs, null);
  assert.equal(ref.attacks[1].keyReleaseMs, null);
  assert.equal(ref.attacks[1].midiControlEndMs, null);
});

test('same-pitch reattack under held CC64 marks the first controller envelope ambiguous', () => {
  const ref = parseMidiReference(midi([track([
    [0, 0xb0, 64, 127],
    [0, 0x90, 60, 100],
    [...varint(240), 0x80, 60, 0],
    [...varint(120), 0x90, 60, 100],
    [...varint(120), 0xb0, 64, 0],
    [0, 0x80, 60, 0],
    [0, 0xff, 0x2f, 0]
  ])]), { withReleases: true });
  assert.equal(ref.attacks[0].pedalHeldAfterRelease, true);
  assert.equal(ref.attacks[0].midiControlEndMs, 500);
  assert.equal(ref.attacks[0].ambiguousRelease, true);
  assert.equal(ref.attacks[1].ambiguousRelease, false);
});
