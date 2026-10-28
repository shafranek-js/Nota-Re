import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiHardwareCheck, makeHardwareCheckReport } from '../src/core/midi/hardwareCheck.ts';

const press = (note, channel = 0) => ({
  type: 'note-on', note, channel, velocity: 80, receivedAtMs: 1
});
const release = (note, channel = 0) => ({
  type: 'note-off', note, channel, velocity: 0, receivedAtMs: 2
});
const pedal = (down, channel = 0) => ({
  type: 'sustain', channel, value: down ? 127 : 0, down, receivedAtMs: 3
});

test('physical key lifecycle requires a matching release', () => {
  const t = new MidiHardwareCheck();
  t.accept(release(60));
  assert.equal(t.snapshot().noteLifecyclePassed, false);
  t.accept(press(60));
  assert.equal(t.snapshot().heldNotes, 1);
  t.accept(release(61));
  assert.equal(t.snapshot().noteOffs, 0);
  t.accept(release(60));
  assert.equal(t.snapshot().noteLifecyclePassed, true);
  assert.equal(t.snapshot().heldNotes, 0);
});

test('chord test requires overlapping held notes, not repeated single taps', () => {
  const t = new MidiHardwareCheck();
  t.accept(press(60)); t.accept(release(60));
  t.accept(press(64)); t.accept(release(64));
  assert.equal(t.snapshot().polyphonyPassed, false);
  t.accept(press(60)); t.accept(press(64));
  assert.equal(t.snapshot().polyphonyPassed, true);
  assert.equal(t.snapshot().maxHeldNotes, 2);
});

test('pedal test requires release under sustain on the same MIDI channel', () => {
  const t = new MidiHardwareCheck();
  t.accept(pedal(true, 0));
  t.accept(press(60, 1)); t.accept(release(60, 1));
  t.accept(pedal(false, 0));
  assert.equal(t.snapshot().sustainPassed, false);
  t.accept(pedal(true, 1));
  t.accept(press(67, 1)); t.accept(release(67, 1));
  assert.equal(t.snapshot().sustainPassed, false);
  assert.equal(t.snapshot().releasesUnderPedal, 1);
  t.accept(pedal(false, 1));
  assert.equal(t.snapshot().sustainPassed, true);
});

test('panic with a physically held note and all-notes-off are distinct', () => {
  const t = new MidiHardwareCheck();
  t.accept({ type: 'panic' });
  assert.equal(t.snapshot().disconnectPanicObserved, false);
  t.accept(press(60));
  t.accept(press(64, 1));
  t.accept({ type: 'all-notes-off', channel: 0, receivedAtMs: 4 });
  assert.equal(t.snapshot().heldNotes, 1);
  t.accept({ type: 'panic' });
  assert.equal(t.snapshot().heldNotes, 0);
  assert.equal(t.snapshot().disconnectPanicObserved, true);
  t.reset();
  assert.equal(t.snapshot().noteOns, 0);
  assert.equal(t.snapshot().disconnectPanicObserved, false);
});

test('sanitized report never exports pitches, device IDs or event timestamps', () => {
  const t = new MidiHardwareCheck();
  t.accept(press(103, 7)); t.accept(release(103, 7));
  const json = makeHardwareCheckReport(t.snapshot(), {
    samples: 1, medianDispatchMs: 2, p95DispatchMs: 2,
    baseLatencyMs: null, outputLatencyMs: 4,
    soundFontCount: 1, oscillatorCount: 0
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'nota-re-midi-hardware-check-v1');
  assert.equal(parsed.checks.keyPressAndRelease, true);
  assert.equal(parsed.aggregate.noteOns, 1);
  assert.equal(parsed.midiToAudioDispatch.samples, 1);
  assert.ok(!json.includes('103'));
  assert.ok(!json.includes('receivedAt'));
  assert.ok(!json.includes('deviceId'));
  assert.ok(!json.includes('velocity'));
});
