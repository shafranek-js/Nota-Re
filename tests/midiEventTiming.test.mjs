import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedMidiSystemTime } from '../src/core/midi/midiEventTiming.ts';

test('valid Web MIDI event timestamp shares the monotonic performance clock', () => {
  assert.equal(validatedMidiSystemTime(992, 1000), 992);
  assert.equal(validatedMidiSystemTime(1000, 1000), 1000);
});

test('missing or incompatible timestamp is omitted, never used to grade rhythm', () => {
  for (const t of [undefined, NaN, -1, 0, Infinity, 1001, -Infinity, 1]) {
    assert.equal(validatedMidiSystemTime(t, 1000), t === 1 ? 1 : null);
  }
  assert.equal(validatedMidiSystemTime(20, 10021), null, 'reject implausibly stale event');
  assert.equal(validatedMidiSystemTime(100, NaN), null);
});
