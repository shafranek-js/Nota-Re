import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReferenceClip } from '../scripts/prepare-maestro-pilot.mjs';

test('anchors acoustic clip around earliest physically recorded note attack', () => {
  const clip = chooseReferenceClip([
    { midi: 60, onsetMs: 3000 },
    { midi: 64, onsetMs: 3100 },
    { midi: 67, onsetMs: 3200 },
    { midi: 69, onsetMs: 18000 }
  ], 30000, 14000);
  assert.equal(clip.startMs, 2300);
  assert.deepEqual(clip.expected.map(x => x.onsetMs), [700, 800, 900]);
});

test('keeps clip inside audio duration without assuming MIDI end is WAV end', () => {
  const clip = chooseReferenceClip([
    { midi: 60, onsetMs: 17500 },
    { midi: 64, onsetMs: 17600 }
  ], 21000, 14000);
  assert.equal(clip.startMs, 6750);
  assert.deepEqual(clip.expected.map(x => x.onsetMs), [10750, 10850]);
});

test('rejects invalid source durations, empty references and one-note clips', () => {
  assert.throws(() => chooseReferenceClip([], 30000), /No playable/);
  assert.throws(() => chooseReferenceClip([{ midi: 60, onsetMs: 200 }], 30000), /insufficient/);
  assert.throws(() => chooseReferenceClip([{ midi: 60, onsetMs: 1 }, { midi: 64, onsetMs: 2 }], 3000), /Invalid/);
});
