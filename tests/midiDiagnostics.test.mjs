import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiAudioDiagnosticsTracker } from '../src/core/audio/midiDiagnostics.ts';

test('diagnostics report bounded callback-to-dispatch samples and correct quantiles', () => {
  const tracker = new MidiAudioDiagnosticsTracker(5);
  assert.equal(tracker.snapshot().medianDispatchMs, null);
  tracker.recordDispatch(100, 101, 'soundfont');
  tracker.recordDispatch(100, 102, 'soundfont');
  tracker.recordDispatch(100, 104, 'oscillator');
  tracker.recordDispatch(100, 108, 'oscillator');
  tracker.recordDispatch(100, 116, 'oscillator');
  assert.equal(tracker.snapshot().samples, 5);
  assert.equal(tracker.snapshot().medianDispatchMs, 4);
  assert.ok(Math.abs(tracker.snapshot().p95DispatchMs - 14.4) < 1e-9);
  assert.equal(tracker.snapshot().maxDispatchMs, 16);
  tracker.recordDispatch(100, 101.5, 'soundfont');
  assert.equal(tracker.snapshot().samples, 5, 'only recent samples are retained');
  assert.equal(tracker.snapshot().soundFontCount, 3, 'route totals are tracked since reset');
  assert.equal(tracker.snapshot().oscillatorCount, 3);
});

test('reject clock skew and invalid measurements without misleading latency', () => {
  const tracker = new MidiAudioDiagnosticsTracker();
  tracker.recordDispatch(10, 9, 'soundfont');
  tracker.recordDispatch(NaN, 10, 'oscillator');
  tracker.recordDispatch(10, Infinity, 'oscillator');
  assert.equal(tracker.snapshot().samples, 0);
  assert.equal(tracker.snapshot().soundFontCount, 0);
});

test('voice peak, pedal counts, listeners and reset do not retain device details', () => {
  const tracker = new MidiAudioDiagnosticsTracker();
  let publishes = 0;
  const unsubscribe = tracker.subscribe(() => publishes++);
  tracker.updateVoices(4, 1);
  tracker.updateVoices(9, 1);
  tracker.updateVoices(0, 0);
  assert.equal(tracker.snapshot().peakVoices, 9);
  tracker.recordDispatch(20, 21, 'soundfont');
  tracker.reset();
  assert.deepEqual(
    [tracker.snapshot().samples, tracker.snapshot().peakVoices,
      tracker.snapshot().activeVoices, tracker.snapshot().sustainedChannels],
    [0, 0, 0, 0]
  );
  assert.ok(publishes >= 5);
  const before = publishes;
  unsubscribe();
  tracker.recordDispatch(21, 22, 'oscillator');
  assert.equal(publishes, before);
  assert.equal(Object.keys(tracker.snapshot()).includes('note'), false);
});

test('reject invalid history lengths', () => {
  assert.throws(() => new MidiAudioDiagnosticsTracker(0), /positive history/);
  assert.throws(() => new MidiAudioDiagnosticsTracker(2.5), /positive history/);
});
