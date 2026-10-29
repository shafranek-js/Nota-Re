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

test('browser system-to-JS queue delay is distinct from JS-to-audio dispatch', () => {
  const tracker = new MidiAudioDiagnosticsTracker(3);
  tracker.recordDispatch(100, 104, 'soundfont', 91);
  tracker.recordDispatch(200, 205, 'oscillator', 180);
  tracker.recordDispatch(300, 302, 'oscillator'); // synthetic MIDI lacks timeStamp
  const snap = tracker.snapshot();
  assert.equal(snap.samples, 3);
  assert.equal(snap.systemTimestampSamples, 2);
  assert.equal(snap.medianMidiQueueMs, 14.5);
  assert.ok(Math.abs(snap.p95MidiQueueMs - 19.45) < 1e-6);
  assert.equal(snap.medianSystemToDispatchMs, 19);
  assert.equal(snap.medianDispatchMs, 4);
  assert.equal(Object.keys(snap).some(k => /deviceId|note|timestamp/i.test(k)), false,
    'no note names, raw event timestamps or identifying device details');

  tracker.recordDispatch(400, 403, 'soundfont', 399);
  tracker.recordDispatch(500, 502, 'soundfont', 500.5); // future is invalid
  assert.equal(tracker.snapshot().systemTimestampSamples, 3);
  assert.equal(tracker.snapshot().medianMidiQueueMs, 9,
    'only validated events count toward queue quantiles');
  tracker.reset();
  assert.equal(tracker.snapshot().systemTimestampSamples, 0);
  assert.equal(tracker.snapshot().medianMidiQueueMs, null);
  assert.equal(tracker.snapshot().medianSystemToDispatchMs, null);
});
