import {
  evaluatePianoBenchmark,
  type PianoBenchmarkCase,
  type PianoBenchmarkDataset,
  type AttackMetrics,
  type AttackMatch
} from './microphoneBenchmark.ts';

/**
 * Strict, independent model comparison: identical audio SHA-256, duration,
 * reference note attacks, categories and scoring tolerance are mandatory.
 * This file never reads audio, runs models or changes lesson certification.
 */
export interface VerifiedPianoCase extends PianoBenchmarkCase {
  readonly audioSha256: string;
  readonly durationMs: number;
}
export interface VerifiedPianoDataset extends PianoBenchmarkDataset {
  readonly cases: readonly VerifiedPianoCase[];
}
export interface AggregateAttackMetrics extends Omit<AttackMetrics, 'matches'> {
  readonly evaluatedDurationMs: number;
  readonly falsePositivesPerMinute: number;
  readonly detectedLatencySamples: number;
}
export interface ModelComparisonSummary {
  readonly engine: string;
  readonly overall: AggregateAttackMetrics;
  readonly byCategory: readonly ({ category: string } & AggregateAttackMetrics)[];
}
export interface PianoComparison {
  readonly onsetToleranceMs: number;
  readonly caseCount: number;
  readonly totalAudioDurationMs: number;
  readonly categories: readonly string[];
  readonly models: readonly ModelComparisonSummary[];
}

function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.ceil(values.length * q) - 1];
}
type ReportCase = AttackMetrics & { readonly id: string; readonly category: string };
function aggregate(cases: readonly ReportCase[], durations: ReadonlyMap<string, number>): AggregateAttackMetrics {
  const tp = cases.reduce((s, c) => s + c.truePositives, 0);
  const fp = cases.reduce((s, c) => s + c.falsePositives, 0);
  const fn = cases.reduce((s, c) => s + c.falseNegatives, 0);
  const totalMs = cases.reduce((s, c) => s + (durations.get(c.id) ?? 0), 0);
  const matches: AttackMatch[] = cases.flatMap(c => [...c.matches]);
  const errors = matches.map(m => m.absoluteOnsetErrorMs);
  const latencies = matches.flatMap(m => m.processingLatencyMs === null ? [] : [m.processingLatencyMs]);
  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null,
    medianAbsoluteOnsetErrorMs: percentile(errors, 0.5),
    p95AbsoluteOnsetErrorMs: percentile(errors, 0.95),
    medianProcessingLatencyMs: percentile(latencies, 0.5),
    p95ProcessingLatencyMs: percentile(latencies, 0.95),
    evaluatedDurationMs: totalMs,
    falsePositivesPerMinute: totalMs > 0 ? fp * 60000 / totalMs : 0,
    detectedLatencySamples: latencies.length
  };
}

function normalizedGroundTruth(data: VerifiedPianoCase): string {
  return JSON.stringify(data.expected.map(x => [x.midi, x.onsetMs])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]));
}
function verifyCase(data: PianoBenchmarkCase, engine: string): asserts data is VerifiedPianoCase {
  const candidate = data as Partial<VerifiedPianoCase>;
  if (!Number.isFinite(candidate.durationMs) ||
      candidate.durationMs! <= 0 || candidate.durationMs! > 600_000 ||
      typeof candidate.audioSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(candidate.audioSha256)) {
    throw new Error('Unverified recording in ' + engine + '/' + data.id +
      ': durationMs and audioSha256 (SHA-256 of original WAV bytes) required');
  }
  if (data.expected.some(x => x.onsetMs > candidate.durationMs!)) {
    throw new Error('Ground-truth onset outside recording in ' + engine + '/' + data.id);
  }
}
export function comparePianoDetectors(
  datasets: readonly PianoBenchmarkDataset[]
): PianoComparison {
  if (!Array.isArray(datasets) || datasets.length < 2) {
    throw new Error('At least two independently exported detector datasets required');
  }
  const first = datasets[0];
  const engineNames = new Set<string>();
  const reference = new Map<string, {
    category: string; audioSha256: string; durationMs: number; expected: string
  }>();
  const sortedCategories = new Set<string>();
  const reports = datasets.map(data => {
    if (engineNames.has(data.engine)) throw new Error('Duplicate detector identity: ' + data.engine);
    engineNames.add(data.engine);
    const report = evaluatePianoBenchmark(data);
    if (data.onsetToleranceMs !== first.onsetToleranceMs) {
      throw new Error('Unequal onset tolerance: ' + data.engine);
    }
    if (data.cases.length !== first.cases.length) {
      throw new Error('Different number of reference cases: ' + data.engine);
    }
    const currentIds = new Set<string>();
    for (const item of data.cases) {
      verifyCase(item, data.engine);
      currentIds.add(item.id);
      sortedCategories.add(item.category);
      const identity = {
        category: item.category,
        audioSha256: item.audioSha256.toLowerCase(),
        durationMs: item.durationMs,
        expected: normalizedGroundTruth(item)
      };
      if (data === first) reference.set(item.id, identity);
      else if (JSON.stringify(identity) !== JSON.stringify(reference.get(item.id))) {
        throw new Error('Different audio/reference/category/duration for ' +
          data.engine + '/' + item.id);
      }
    }
    if (currentIds.size !== reference.size) throw new Error('Inconsistent case identifiers: ' + data.engine);
    return report;
  });
  const durations = new Map([...reference].map(([id, item]) => [id, item.durationMs]));
  const categories = [...sortedCategories].sort();
  const models = reports.map(report => ({
    engine: report.engine,
    overall: aggregate(report.cases, durations),
    byCategory: categories.map(category => ({
      category,
      ...aggregate(report.cases.filter(c => c.category === category), durations)
    }))
  }));
  return {
    onsetToleranceMs: first.onsetToleranceMs,
    caseCount: reference.size,
    totalAudioDurationMs: [...durations.values()].reduce((a, b) => a + b, 0),
    categories,
    models
  };
}
