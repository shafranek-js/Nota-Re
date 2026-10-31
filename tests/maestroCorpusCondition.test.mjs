import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIndependentSources } from '../scripts/prepare-maestro-corpus.mjs';
import { summarizePianoCorpus } from '../src/core/audio/microphoneConditionAnalysis.ts';

const source = (index) => ({
  id: 'maestro-validation-0' + index,
  dataset: 'MAESTRO v3.0.0', split: 'validation',
  composer: 'Composer ' + index, title: 'Composition ' + index,
  audio_filename: 'recording' + index + '.wav',
  source_audio: { sha256: String(index).repeat(64) }
});
const attack = (midi, onsetMs) => ({ midi, onsetMs });
const expected = [
  attack(40, 100), attack(60, 100), attack(72, 100),
  attack(60, 350), attack(64, 500)
];
const a = [attack(40, 105), attack(60, 105), attack(72, 105),
  attack(60, 360), attack(84, 105)];
const b = [attack(40, 105), attack(60, 105), attack(84, 105)];
const dataset = (engine, detected) => ({
  schemaVersion: 1, engine, onsetToleranceMs: 100,
  cases: [1, 2, 3].map(index => ({
    id: 'maestro-validation-0' + index,
    category: 'maestro-acoustic-piano', durationMs: 14000,
    audioSha256: String(index).repeat(64),
    expected, detected
  }))
});

test('requires independent validation composers and source audio hashes', () => {
  const valid = [source(1), source(2), source(3)];
  assert.doesNotThrow(() => validateIndependentSources(valid));
  assert.throws(() => validateIndependentSources(valid.slice(0, 2)), /three/);
  assert.throws(() => validateIndependentSources([
    valid[0], { ...valid[1], composer: valid[0].composer }, valid[2]
  ]), /reused/);
  assert.throws(() => validateIndependentSources([
    valid[0], { ...valid[1], source_audio: valid[0].source_audio }, valid[2]
  ]), /reused/);
  assert.throws(() => validateIndependentSources([
    valid[0], { ...valid[1], split: 'test' }, valid[2]
  ]), /validation/);
});

test('condition classification uses the scored one-to-one matcher and independent MIDI truth', () => {
  const summary = summarizePianoCorpus([dataset('model-a', a), dataset('model-b', b)]);
  const first = summary.models[0].takes[0];
  const second = summary.models[1].takes[0];
  assert.deepEqual([first.truePositives, first.falsePositives, first.falseNegatives], [4, 1, 1]);
  assert.deepEqual([second.truePositives, second.falsePositives, second.falseNegatives], [2, 1, 3]);
  assert.equal(first.condition.truthConditions.simultaneousWithin50Ms.referenceAttacks, 3);
  assert.equal(first.condition.truthConditions.simultaneousWithin50Ms.detectedReferenceAttacks, 3);
  assert.equal(second.condition.truthConditions.simultaneousWithin50Ms.detectedReferenceAttacks, 2);
  assert.equal(first.condition.truthConditions.repeatedSamePitchWithin500Ms.referenceAttacks, 1);
  assert.equal(first.condition.truthConditions.repeatedSamePitchWithin500Ms.detectedReferenceAttacks, 1);
  assert.equal(first.condition.truthConditions.genuineOctaveWithin50Ms.referenceAttacks, 2);
  assert.equal(first.condition.truthConditions.genuineOctaveWithin50Ms.detectedReferenceAttacks, 2);
  assert.equal(second.condition.truthConditions.genuineOctaveWithin50Ms.detectedReferenceAttacks, 1);
  assert.equal(first.condition.truthConditions.pedalDownAtOnset, null);
  assert.equal(first.condition.truthConditions.isolatedNoOtherPitchWithin50Ms.referenceAttacks, 2);
  assert.equal(first.coincidences.unmatchedOctave12, 1);
  assert.deepEqual(first.condition.registers.map(r => r.falsePositives), [0, 0, 1]);
  assert.equal(summary.comparison.caseCount, 3);
  assert.equal(summary.pairedMacroF1.independentPerformanceCount, 3);
  assert.ok(summary.pairedMacroF1.observedMacroF1Difference > 0);
  assert.equal(summary.actualDeviceMicrophoneLatencyMs, null);
  assert.equal(summary.pedalCondition, null);
});

test('refuses unequal independent audio/reference across the two models', () => {
  const tampered = dataset('model-b', b);
  tampered.cases[1].audioSha256 = 'f'.repeat(64);
  assert.throws(() =>
    summarizePianoCorpus([dataset('model-a', a), tampered]), /Different audio/);
});

test('refuses to infer any general conclusion from one recording', () => {
  const shortA = dataset('model-a', a);
  const shortB = dataset('model-b', b);
  shortA.cases.length = 1; shortB.cases.length = 1;
  assert.throws(() => summarizePianoCorpus([shortA, shortB]), /three/);
});

test('independent CC64 partitions recall and cannot be silently changed by a model', () => {
  const reference = expected.map((note, i) => ({
    ...note, pedalDownAtOnset: i < 3 ? true : i === 3 ? false : null
  }));
  const first = dataset('model-a', a);
  const second = dataset('model-b', b);
  for (const item of [...first.cases, ...second.cases]) item.expected = reference;
  const summary = summarizePianoCorpus([first, second]);
  const truth = summary.models[0].takes[0].condition.truthConditions;
  assert.equal(truth.pedalDownAtOnset.referenceAttacks, 3);
  assert.equal(truth.pedalDownAtOnset.detectedReferenceAttacks, 3);
  assert.equal(truth.pedalUpAtOnset.referenceAttacks, 1);
  assert.equal(truth.pedalUpAtOnset.detectedReferenceAttacks, 1);
  assert.equal(truth.pedalUnknownAtOnset.referenceAttacks, 1);
  assert.equal(summary.models[1].takes[0].condition.truthConditions.pedalDownAtOnset.recall, 2 / 3);
  assert.match(summary.pedalCondition, /CC64/);
  second.cases[1].expected = reference.map((note, i) =>
    i === 0 ? { ...note, pedalDownAtOnset: false } : note);
  assert.throws(() => summarizePianoCorpus([first, second]), /Different audio/);
});

test('different independently labeled pedal ground truth is invalid, even when notes match', () => {
  const first = dataset('model-a', a);
  const second = dataset('model-b', b);
  first.cases[0].expected = expected.map(x => ({...x, pedalDownAtOnset: null}));
  assert.throws(() => summarizePianoCorpus([first, second]), /Different audio/);
  second.cases[0].expected = expected.map(x => ({...x, pedalDownAtOnset: 'definitely'}));
  assert.throws(() => summarizePianoCorpus([first, second]), /Invalid independent CC64/);
});

test('release-aware reference classifies MIDI control hold separately from acoustic decay', () => {
  const annotations = [
    { keyReleaseMs: 200, midiControlEndMs: 650, pedalHeldAfterRelease: true, ambiguousRelease: false },
    { keyReleaseMs: 180, midiControlEndMs: 180, pedalHeldAfterRelease: false, ambiguousRelease: false },
    { keyReleaseMs: null, midiControlEndMs: null, pedalHeldAfterRelease: null, ambiguousRelease: false },
    { keyReleaseMs: 440, midiControlEndMs: null, pedalHeldAfterRelease: true, ambiguousRelease: false },
    { keyReleaseMs: 600, midiControlEndMs: 600, pedalHeldAfterRelease: false, ambiguousRelease: true }
  ];
  const aData = dataset('model-a', a);
  const bData = dataset('model-b', b);
  for (const item of [...aData.cases, ...bData.cases]) {
    item.expected = expected.map((note, i) => ({ ...note, pedalDownAtOnset: false, ...annotations[i] }));
  }
  const summary = summarizePianoCorpus([aData, bData]);
  const first = summary.models[0].takes[0].condition.releaseAware;
  const second = summary.models[1].takes[0].condition.releaseAware;
  assert.equal(first.observedUnambiguousKeyRelease.referenceAttacks, 3);
  assert.equal(first.observedUnambiguousKeyRelease.detectedReferenceAttacks, 3);
  assert.equal(first.pedalHeldAfterKeyRelease.referenceAttacks, 2);
  assert.equal(first.pedalHeldAfterKeyRelease.detectedReferenceAttacks, 2);
  assert.equal(second.pedalHeldAfterKeyRelease.detectedReferenceAttacks, 1);
  assert.equal(first.keyReleaseWithoutPedalHold.referenceAttacks, 1);
  assert.equal(first.missingOrAmbiguousReleaseOrPedal.referenceAttacks, 2);
  assert.equal(first.completePedalHeldControlEnds, 1);
  assert.equal(first.censoredPedalHeldControlEnds, 1);
  assert.equal(first.medianMidiControllerHoldAfterKeyReleaseMs, 450);
  assert.equal(first.p95MidiControllerHoldAfterKeyReleaseMs, 450);
  assert.deepEqual([summary.models[0].takes[0].truePositives, summary.models[0].takes[0].falsePositives,
    summary.models[0].takes[0].falseNegatives], [4, 1, 1],
    'release diagnostics must never alter exact note-on scoring');
  bData.cases[1].expected = bData.cases[1].expected.map((x, i) =>
    i === 0 ? { ...x, midiControlEndMs: 600 } : x);
  assert.throws(() => summarizePianoCorpus([aData, bData]), /Different audio\/reference/);
});

test('rejects impossible or malicious release envelopes', () => {
  for (const bad of [
    { keyReleaseMs: 50, midiControlEndMs: 70, pedalHeldAfterRelease: true, ambiguousRelease: false },
    { keyReleaseMs: 200, midiControlEndMs: 150, pedalHeldAfterRelease: true, ambiguousRelease: false },
    { keyReleaseMs: null, midiControlEndMs: 300, pedalHeldAfterRelease: null, ambiguousRelease: false },
    { keyReleaseMs: 200, midiControlEndMs: 200, pedalHeldAfterRelease: 'yes', ambiguousRelease: false }
  ]) {
    const first = dataset('first', a);
    const second = dataset('second', b);
    first.cases[0].expected = expected.map((x, i) =>
      i === 0 ? { ...x, ...bad } : x);
    second.cases[0].expected = first.cases[0].expected;
    assert.throws(() => summarizePianoCorpus([first, second]),
      /Invalid independent release\/CC64 reference envelope/);
  }
});
