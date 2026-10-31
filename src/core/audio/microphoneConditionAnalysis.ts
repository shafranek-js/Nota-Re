import {
  evaluatePianoBenchmarkCase,
  type PianoBenchmarkCase,
  type PianoBenchmarkDataset
} from './microphoneBenchmark.ts';
import { comparePianoDetectors } from './microphoneComparison.ts';
import { diagnosePianoBenchmarkCase } from './microphoneFailureAnalysis.ts';

/** Research-only. Every condition is derived from independent MIDI, NEVER from predictions.
 * Condition-level precision is intentionally not assigned: FP has no unambiguous
 * isolated/chord/repeated truth label. Keep these as recall-only truth partitions.
 */
const ranges = [
  { label: 'bass', min: 21, max: 47 },
  { label: 'middle', min: 48, max: 71 },
  { label: 'treble', min: 72, max: 108 }
] as const;

function recall(indices: number[], matched: Set<number>) {
  const tp = indices.filter(i => matched.has(i)).length;
  return {
    referenceAttacks: indices.length,
    detectedReferenceAttacks: tp,
    missedReferenceAttacks: indices.length - tp,
    recall: indices.length ? tp / indices.length : null
  };
}

function conditionBreakdown(data: PianoBenchmarkCase, toleranceMs: number) {
  const report = evaluatePianoBenchmarkCase(data, toleranceMs);
  const matchedTruth = new Set(report.matches.map(m => m.expectedIndex));
  const matchedDetected = new Set(report.matches.map(m => m.detectedIndex));
  const all = data.expected.map((_, i) => i);
  const simultaneous = all.filter(i => data.expected.some((other, j) =>
    i !== j && other.midi !== data.expected[i].midi &&
    Math.abs(other.onsetMs - data.expected[i].onsetMs) <= 50));
  const repeated = all.filter(i => data.expected.some((other, j) =>
    i !== j && other.midi === data.expected[i].midi &&
    data.expected[i].onsetMs - other.onsetMs > 50 &&
    data.expected[i].onsetMs - other.onsetMs <= 500));
  const setChord = new Set(simultaneous);
  // A genuine written/performed octave is an independent MIDI reference pair,
  // not an unmatched model prediction one octave above a different note.
  const genuineOctaves = all.filter(i => data.expected.some((other, j) =>
    i !== j && Math.abs(other.midi - data.expected[i].midi) === 12 &&
    Math.abs(other.onsetMs - data.expected[i].onsetMs) <= 50));
  const pedalAnnotations = data.expected.map(note =>
    (note as typeof note & { pedalDownAtOnset?: boolean | null }).pedalDownAtOnset);
  const hasPedalEvidence = pedalAnnotations.some(x => typeof x === 'boolean');
  const unmatched = data.detected.filter((_, i) => !matchedDetected.has(i));
  return {
    registers: ranges.map(r => ({
      label: r.label,
      ...recall(all.filter(i => data.expected[i].midi >= r.min &&
        data.expected[i].midi <= r.max), matchedTruth),
      falsePositives: unmatched.filter(x => x.midi >= r.min && x.midi <= r.max).length
    })),
    truthConditions: {
      simultaneousWithin50Ms: recall(simultaneous, matchedTruth),
      isolatedNoOtherPitchWithin50Ms: recall(all.filter(i => !setChord.has(i)), matchedTruth),
      repeatedSamePitchWithin500Ms: recall(repeated, matchedTruth),
      notRepeatedSamePitchWithin500Ms: recall(all.filter(i => !repeated.includes(i)), matchedTruth),
      genuineOctaveWithin50Ms: recall(genuineOctaves, matchedTruth),
      pedalDownAtOnset: hasPedalEvidence
        ? recall(all.filter(i => pedalAnnotations[i] === true), matchedTruth) : null,
      pedalUpAtOnset: hasPedalEvidence
        ? recall(all.filter(i => pedalAnnotations[i] === false), matchedTruth) : null,
      pedalUnknownAtOnset: recall(all.filter(i => pedalAnnotations[i] == null), matchedTruth)
    }
  };
}

function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
}

/** Explicitly exploratory paired resampling of independent *performances*, not attacks. */
function pairedBootstrap(a: number[], b: number[]) {
  if (a.length !== b.length || a.length < 3 || a.some(x => !Number.isFinite(x)) ||
      b.some(x => !Number.isFinite(x))) return null;
  let seed = 129;
  const diffs: number[] = [];
  for (let trial = 0; trial < 4096; trial++) {
    let total = 0;
    for (let draw = 0; draw < a.length; draw++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const i = Math.floor(seed / 4294967296 * a.length);
      total += a[i] - b[i];
    }
    diffs.push(total / a.length);
  }
  return {
    comparison: 'first model macro F1 minus second model macro F1',
    observedMacroF1Difference: a.reduce((s, v, i) => s + v - b[i], 0) / a.length,
    exploratoryBootstrapPercentileInterval: [percentile(diffs, 0.025), percentile(diffs, 0.975)],
    independentPerformanceCount: a.length,
    caveat: 'Descriptive paired resampling only; a small, selected validation corpus cannot support population-generalizable confidence claims'
  };
}

export function summarizePianoCorpus(datasets: readonly PianoBenchmarkDataset[]) {
  const comparison = comparePianoDetectors(datasets);
  if (comparison.caseCount < 3) {
    throw new Error('Multi-performance report requires at least three independent takes');
  }
  const byModel = datasets.map(data => {
    const takes = data.cases.map(item => {
      const scored = evaluatePianoBenchmarkCase(item, data.onsetToleranceMs);
      const diagnosis = diagnosePianoBenchmarkCase(item, data.onsetToleranceMs);
      const condition = conditionBreakdown(item, data.onsetToleranceMs);
      const durationMs = (item as typeof item & { durationMs: number }).durationMs;
      const suppliedConfidences = item.detected.flatMap(x =>
        x.confidence === undefined ? [] : [x.confidence]);
      return {
        id: item.id,
        durationMs,
        independentReferenceAttacks: item.expected.length,
        referenceAttackDensityPerSecond: item.expected.length / (durationMs / 1000),
        truePositives: scored.truePositives, falsePositives: scored.falsePositives,
        falseNegatives: scored.falseNegatives,
        precision: scored.precision, recall: scored.recall, f1: scored.f1,
        onsetP50Ms: scored.medianAbsoluteOnsetErrorMs,
        onsetP95Ms: scored.p95AbsoluteOnsetErrorMs,
        modelSpecificConfidencePresent: suppliedConfidences.length,
        medianModelSpecificConfidence: percentile(suppliedConfidences, 0.5),
        offlineLiveLatencyMs: null,
        condition,
        coincidences: {
          unmatchedOctave12: diagnosis.falsePositivesAtReferenceOctave12,
          unmatchedOctave24: diagnosis.falsePositivesAtReferenceOctave24,
          unmatchedFifth19: diagnosis.falsePositivesAtReferenceHarmonic19,
          unmatchedOffset28: diagnosis.falsePositivesAtReferenceHarmonic28
        }
      };
    });
    return { engine: data.engine, takes };
  });
  const first = byModel[0].takes;
  const second = byModel[1].takes;
  const paired = pairedBootstrap(
    first.map(x => x.f1 ?? NaN),
    second.map(x => second.find(y => y.id === x.id)?.f1 ?? NaN)
  );
  return {
    schemaVersion: 1,
    purpose: 'Research only; NOT a grade, model selection or microphone latency result',
    conditionDefinitions: {
      registers: 'bass MIDI 21–47; middle 48–71; treble 72–108',
      simultaneous: 'independent MIDI truth: other pitch attacked within ±50ms',
      repeated: 'independent MIDI truth: earlier same-pitch attack 51–500ms before',
      genuineOctave: 'independent MIDI truth: another note with pitch 12 semitones away attacked within ±50ms; counts attacked notes, not pairs',
      pedal: 'channel-scoped MIDI CC64 value ≥64 at note onset; channel with no CC64 events is unknown; this is NOT evidence of acoustic string sustain',
      attackDensity: 'all truth attacks divided by the selected clip duration',
      caveat: 'Conditions overlap; truth-condition recall cannot be converted to precision/F1 by assigning unmatched predicted notes to arbitrary truth categories'
    },
    comparison,
    models: byModel,
    pairedMacroF1: paired,
    modelRuntimeMs: null,
    modelColdStartMs: null,
    actualDeviceMicrophoneLatencyMs: null,
    pedalCondition: datasets[0].cases.some(item => item.expected.some(note =>
      typeof (note as typeof note & { pedalDownAtOnset?: boolean | null }).pedalDownAtOnset === 'boolean'))
      ? 'independent MIDI CC64 pedal state at attack (not acoustic sustain)' : null
  };
}
