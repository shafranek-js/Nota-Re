/** Pure offline onset benchmark; no browser, microphone, course or scoring dependencies. */
export interface PianoAttack {
  readonly midi: number;
  /** Milliseconds on the same calibrated recording timeline for truth and detector. */
  readonly onsetMs: number;
}
export interface DetectedPianoAttack extends PianoAttack {
  /** When the detector emitted its answer, never the estimated attack time. */
  readonly emittedAtMs?: number;
  /** Uncalibrated, model-specific confidence. */
  readonly confidence?: number;
}
export interface PianoBenchmarkCase {
  readonly id: string;
  readonly category: string;
  readonly expected: readonly PianoAttack[];
  readonly detected: readonly DetectedPianoAttack[];
}
export interface PianoBenchmarkDataset {
  readonly schemaVersion: 1;
  readonly engine: string;
  readonly onsetToleranceMs: number;
  readonly cases: readonly PianoBenchmarkCase[];
}
export interface AttackMatch {
  readonly expectedIndex: number;
  readonly detectedIndex: number;
  readonly midi: number;
  readonly onsetErrorMs: number;
  readonly absoluteOnsetErrorMs: number;
  readonly processingLatencyMs: number | null;
}
export interface AttackMetrics {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly medianAbsoluteOnsetErrorMs: number | null;
  readonly p95AbsoluteOnsetErrorMs: number | null;
  readonly medianProcessingLatencyMs: number | null;
  readonly p95ProcessingLatencyMs: number | null;
  readonly matches: readonly AttackMatch[];
}
type Indexed<T> = { value: T; index: number };
type Direction = 'match' | 'skip-truth' | 'skip-detection';
type Cell = { count: number; error: number; direction: Direction };

function validateAttack(event: PianoAttack, where: string): void {
  if (!Number.isSafeInteger(event.midi) || event.midi < 21 || event.midi > 108 ||
      !Number.isFinite(event.onsetMs) || event.onsetMs < 0) {
    throw new Error('Invalid ' + where + ': piano MIDI 21..108 and nonnegative finite onsetMs required');
  }
}
function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.ceil(values.length * q) - 1];
}
function summarize(tp: number, fp: number, fn: number, matches: readonly AttackMatch[]): AttackMetrics {
  const errors = matches.map(m => m.absoluteOnsetErrorMs);
  const latencies = matches.flatMap(m => m.processingLatencyMs === null ? [] : [m.processingLatencyMs]);
  return {
    truePositives: tp, falsePositives: fp, falseNegatives: fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null,
    medianAbsoluteOnsetErrorMs: quantile([...errors], 0.5),
    p95AbsoluteOnsetErrorMs: quantile([...errors], 0.95),
    medianProcessingLatencyMs: quantile([...latencies], 0.5),
    p95ProcessingLatencyMs: quantile([...latencies], 0.95),
    matches
  };
}

/**
 * Optimal one-to-one onset matches for each MIDI pitch.
 * Objective: maximize correct attacks, then minimize total absolute timing error.
 * Unlike nearest-neighbour greediness, a held/repeated note cannot score twice.
 */
function matchPitch(
  expected: readonly Indexed<PianoAttack>[],
  detected: readonly Indexed<DetectedPianoAttack>[],
  tolerance: number
): AttackMatch[] {
  const n = expected.length, m = detected.length;
  const dp: Cell[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, (): Cell => ({ count: 0, error: 0, direction: 'skip-truth' })));
  const better = (a: Cell, b: Cell) => a.count > b.count ||
    (a.count === b.count && a.error < b.error);
  for (let i = n; i >= 0; i--) for (let j = m; j >= 0; j--) {
    if (i === n && j === m) continue;
    let best: Cell | null = null;
    if (i < n) best = { ...dp[i + 1][j], direction: 'skip-truth' };
    if (j < m) {
      const candidate: Cell = { ...dp[i][j + 1], direction: 'skip-detection' };
      if (best === null || better(candidate, best)) best = candidate;
    }
    if (i < n && j < m) {
      const difference = Math.abs(expected[i].value.onsetMs - detected[j].value.onsetMs);
      if (difference <= tolerance) {
        const after = dp[i + 1][j + 1];
        const candidate: Cell = {
          count: after.count + 1, error: after.error + difference, direction: 'match'
        };
        if (best === null || better(candidate, best)) best = candidate;
      }
    }
    dp[i][j] = best!;
  }
  const matches: AttackMatch[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    const direction = dp[i][j].direction;
    if (direction === 'skip-truth') { i++; continue; }
    if (direction === 'skip-detection') { j++; continue; }
    const truth = expected[i], observed = detected[j];
    const onsetErrorMs = observed.value.onsetMs - truth.value.onsetMs;
    matches.push({
      expectedIndex: truth.index,
      detectedIndex: observed.index,
      midi: truth.value.midi,
      onsetErrorMs, absoluteOnsetErrorMs: Math.abs(onsetErrorMs),
      processingLatencyMs: observed.value.emittedAtMs === undefined
        ? null : observed.value.emittedAtMs - truth.value.onsetMs
    });
    i++; j++;
  }
  return matches;
}

export function evaluatePianoBenchmarkCase(
  data: PianoBenchmarkCase, onsetToleranceMs: number
): AttackMetrics {
  if (!Number.isFinite(onsetToleranceMs) || onsetToleranceMs < 0 || onsetToleranceMs > 1000) {
    throw new Error('Invalid onset tolerance: must be 0..1000 ms');
  }
  for (const [i, item] of data.expected.entries()) validateAttack(item, 'expected[' + i + ']');
  for (const [i, item] of data.detected.entries()) {
    validateAttack(item, 'detected[' + i + ']');
    if (item.confidence !== undefined &&
        (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) {
      throw new Error('Invalid detected confidence');
    }
    if (item.emittedAtMs !== undefined &&
        (!Number.isFinite(item.emittedAtMs) || item.emittedAtMs < item.onsetMs)) {
      throw new Error('Invalid detection emission timestamp');
    }
  }
  const matches: AttackMatch[] = [];
  for (let midi = 21; midi <= 108; midi++) {
    const byPitch = <T extends PianoAttack>(items: readonly T[]): Indexed<T>[] =>
      items.map((value, index) => ({ value, index }))
        .filter(x => x.value.midi === midi)
        .sort((a, b) => a.value.onsetMs - b.value.onsetMs || a.index - b.index);
    matches.push(...matchPitch(byPitch(data.expected), byPitch(data.detected), onsetToleranceMs));
  }
  matches.sort((a, b) => a.expectedIndex - b.expectedIndex);
  return summarize(matches.length, data.detected.length - matches.length,
    data.expected.length - matches.length, matches);
}

export function evaluatePianoBenchmark(data: PianoBenchmarkDataset) {
  if (data.schemaVersion !== 1 || typeof data.engine !== 'string' || !data.engine.trim() ||
      !Array.isArray(data.cases) || !data.cases.length) {
    throw new Error('Invalid dataset: schemaVersion 1, engine and nonempty cases required');
  }
  const seen = new Set<string>();
  const cases = data.cases.map(item => {
    if (typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id) ||
        typeof item.category !== 'string' || !item.category.trim() ||
        !Array.isArray(item.expected) || !Array.isArray(item.detected)) {
      throw new Error('Invalid benchmark case: unique id, category, expected[], detected[] required');
    }
    seen.add(item.id);
    return { id: item.id, category: item.category,
      ...evaluatePianoBenchmarkCase(item, data.onsetToleranceMs) };
  });
  const tp = cases.reduce((sum, c) => sum + c.truePositives, 0);
  const fp = cases.reduce((sum, c) => sum + c.falsePositives, 0);
  const fn = cases.reduce((sum, c) => sum + c.falseNegatives, 0);
  return { engine: data.engine, onsetToleranceMs: data.onsetToleranceMs,
    overall: summarize(tp, fp, fn, cases.flatMap(c => c.matches)), cases };
}
