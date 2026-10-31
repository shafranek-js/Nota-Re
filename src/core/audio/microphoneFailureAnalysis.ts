import {
  evaluatePianoBenchmarkCase,
  type PianoBenchmarkCase,
  type PianoBenchmarkDataset
} from './microphoneBenchmark.ts';

/** Descriptive error diagnostics; these are NOT proven physical causes of errors.
 * Crucially, use the same optimal one-to-one matches as the official offline
 * benchmark, so no separate ad-hoc "nearest note" algorithm changes TP/FP/FN.
 */
export interface PitchRangeCounts {
  readonly label: 'bass' | 'middle' | 'treble';
  readonly minMidi: number;
  readonly maxMidi: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
}
export interface PianoFailureSummary {
  readonly id: string;
  readonly category: string;
  readonly expectedAttacks: number;
  readonly detectedAttacks: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly falsePositivesCoincidentWithAnyTruth: number;
  /** May include genuine octaves: temporal co-occurrence is not an acoustic diagnosis. */
  readonly falsePositivesAtReferenceOctave12: number;
  readonly falsePositivesAtReferenceOctave24: number;
  readonly falsePositivesAtReferenceHarmonic19: number;
  readonly falsePositivesAtReferenceHarmonic28: number;
  /** Same pitch, reference is 1–2 onset-tolerances away: candidate timing error, not proven. */
  readonly falsePositivesNearSamePitchOutsideTolerance: number;
  readonly medianSignedMatchedOnsetErrorMs: number | null;
  readonly byRegister: readonly PitchRangeCounts[];
}
const ranges = [
  { label: 'bass', minMidi: 21, maxMidi: 47 },
  { label: 'middle', minMidi: 48, maxMidi: 71 },
  { label: 'treble', minMidi: 72, maxMidi: 108 }
] as const;

function median(values: number[]): number | null {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const center = Math.floor(values.length / 2);
  return values.length % 2 ? values[center] : (values[center - 1] + values[center]) / 2;
}

export function diagnosePianoBenchmarkCase(
  data: PianoBenchmarkCase,
  onsetToleranceMs: number
): PianoFailureSummary {
  const assessed = evaluatePianoBenchmarkCase(data, onsetToleranceMs);
  const matchedTruth = new Set(assessed.matches.map(m => m.expectedIndex));
  const matchedDetected = new Set(assessed.matches.map(m => m.detectedIndex));
  const remainingTruth = data.expected.filter((_, i) => !matchedTruth.has(i));
  const extras = data.detected.filter((_, i) => !matchedDetected.has(i));
  const nearTruth = (extra: { midi: number; onsetMs: number }, semitones: number | null) =>
    data.expected.some(truth =>
      (semitones === null || Math.abs(extra.midi - truth.midi) === semitones) &&
      Math.abs(extra.onsetMs - truth.onsetMs) <= onsetToleranceMs);

  return {
    id: data.id, category: data.category,
    expectedAttacks: data.expected.length,
    detectedAttacks: data.detected.length,
    truePositives: assessed.truePositives,
    falsePositives: assessed.falsePositives,
    falseNegatives: assessed.falseNegatives,
    falsePositivesCoincidentWithAnyTruth: extras.filter(x => nearTruth(x, null)).length,
    falsePositivesAtReferenceOctave12: extras.filter(x => nearTruth(x, 12)).length,
    falsePositivesAtReferenceOctave24: extras.filter(x => nearTruth(x, 24)).length,
    falsePositivesAtReferenceHarmonic19: extras.filter(x => nearTruth(x, 19)).length,
    falsePositivesAtReferenceHarmonic28: extras.filter(x => nearTruth(x, 28)).length,
    falsePositivesNearSamePitchOutsideTolerance: extras.filter(x =>
      data.expected.some(truth => truth.midi === x.midi &&
        Math.abs(truth.onsetMs - x.onsetMs) > onsetToleranceMs &&
        Math.abs(truth.onsetMs - x.onsetMs) <= onsetToleranceMs * 2)
    ).length,
    medianSignedMatchedOnsetErrorMs: median(assessed.matches.map(x => x.onsetErrorMs)),
    byRegister: ranges.map(range => ({
      ...range,
      truePositives: assessed.matches.filter(x => x.midi >= range.minMidi && x.midi <= range.maxMidi).length,
      falsePositives: extras.filter(x => x.midi >= range.minMidi && x.midi <= range.maxMidi).length,
      falseNegatives: remainingTruth.filter(x => x.midi >= range.minMidi && x.midi <= range.maxMidi).length
    }))
  };
}

export function diagnosePianoBenchmark(data: PianoBenchmarkDataset) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.cases) ||
      typeof data.engine !== 'string' || !data.engine.trim()) {
    throw new Error('Invalid acoustic detector dataset');
  }
  const cases = data.cases.map(x => diagnosePianoBenchmarkCase(x, data.onsetToleranceMs));
  return { engine: data.engine, onsetToleranceMs: data.onsetToleranceMs,
    cases, aggregate: {
      expectedAttacks: cases.reduce((s, x) => s + x.expectedAttacks, 0),
      detectedAttacks: cases.reduce((s, x) => s + x.detectedAttacks, 0),
      truePositives: cases.reduce((s, x) => s + x.truePositives, 0),
      falsePositives: cases.reduce((s, x) => s + x.falsePositives, 0),
      falseNegatives: cases.reduce((s, x) => s + x.falseNegatives, 0),
      falsePositivesAtReferenceOctave12: cases.reduce((s, x) => s + x.falsePositivesAtReferenceOctave12, 0),
      falsePositivesAtReferenceOctave24: cases.reduce((s, x) => s + x.falsePositivesAtReferenceOctave24, 0)
    }
  };
}
