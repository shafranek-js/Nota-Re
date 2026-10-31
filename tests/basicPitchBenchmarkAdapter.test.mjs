import test from 'node:test';
import assert from 'node:assert/strict';
import { basicPitchNotesToOnsets } from '../src/core/audio/basicPitchBenchmarkAdapter.ts';
import { evaluatePianoBenchmarkCase } from '../src/core/audio/microphoneBenchmark.ts';

test('preserves each independent note of a real octave or chord', () => {
  const results = basicPitchNotesToOnsets([
    { pitchMidi: 72, startTimeSeconds: 1.01, amplitude: 0.7 },
    { pitchMidi: 60, startTimeSeconds: 1, amplitude: 0.8 },
    { pitchMidi: 64, startTimeSeconds: 1, amplitude: 0.6 }
  ]);
  assert.deepEqual(results.map(x => x.midi), [60, 64, 72]);
  assert.deepEqual(results.map(x => x.onsetMs), [1000, 1000, 1010]);
});

test('two genuine repeated attacks remain independent events', () => {
  const results = basicPitchNotesToOnsets([
    { pitchMidi: 60, startTimeSeconds: 1, amplitude: 0.8 },
    { pitchMidi: 60, startTimeSeconds: 1.3, amplitude: 0.7 }
  ]);
  assert.equal(results.length, 2);
  const metrics = evaluatePianoBenchmarkCase({
    id: 'repeated', category: 'repeated',
    expected: [{ midi: 60, onsetMs: 1000 }, { midi: 60, onsetMs: 1300 }],
    detected: results
  }, 100);
  assert.equal(metrics.truePositives, 2);
  assert.equal(metrics.falsePositives, 0);
});

test('does not invent emission latency from an offline transcription', () => {
  const [observed] = basicPitchNotesToOnsets([
    { pitchMidi: 48, startTimeSeconds: 0.12, amplitude: 0.4 }
  ]);
  assert.equal('emittedAtMs' in observed, false);
});

test('rejects invalid pitch, time and confidence rather than silently censoring errors', () => {
  for (const event of [
    { pitchMidi: 20, startTimeSeconds: 0, amplitude: 0.7 },
    { pitchMidi: 109, startTimeSeconds: 0, amplitude: 0.7 },
    { pitchMidi: 60, startTimeSeconds: -1, amplitude: 0.7 },
    { pitchMidi: 60, startTimeSeconds: Infinity, amplitude: 0.7 },
    { pitchMidi: 60, startTimeSeconds: 0, amplitude: 1.2 }
  ]) assert.throws(() => basicPitchNotesToOnsets([event]), /Invalid/);
});
