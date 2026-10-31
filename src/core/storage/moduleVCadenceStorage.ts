/** V5 has an independent, bounded, ungraded journal: no course writes. */
const KEY = 'notare_module_v_cadences_v5';
const LIMIT = 60;
export interface V5Attempt {
  readonly fixtureId: string;
  readonly bpm: number;
  readonly matchedOnsets: number;
  readonly totalOnsets: number;
  readonly rightMatched: number;
  readonly rightExpected: number;
  readonly leftMatched: number;
  readonly leftExpected: number;
  readonly misses: number;
  readonly wrongPitches: number;
  readonly offBeatNotes: number;
  readonly earlyReleases: number;
  readonly overheldNotes: number;
  readonly interruptions: number;
  readonly clean: boolean;
}
export interface V5Journal {
  readonly schemaVersion: 5;
  readonly attempts: readonly V5Attempt[];
}
export const EMPTY_V5: V5Journal = { schemaVersion: 5, attempts: [] };
function validAttempt(value: unknown): value is V5Attempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.fixtureId !== 'string' ||
      !/^v5-(0[1-9]|[12][0-9]|3[0-6])$/.test(row.fixtureId) ||
      !Number.isSafeInteger(row.bpm) || (row.bpm as number) < 40 ||
      (row.bpm as number) > 100 || typeof row.clean !== 'boolean') return false;
  const keys = ['matchedOnsets', 'totalOnsets', 'rightMatched', 'rightExpected',
    'leftMatched', 'leftExpected', 'misses', 'wrongPitches', 'offBeatNotes',
    'earlyReleases', 'overheldNotes', 'interruptions'] as const;
  if (!keys.every(k => Number.isSafeInteger(row[k]) &&
      (row[k] as number) >= 0 && (row[k] as number) <= 100)) return false;
  return (row.matchedOnsets as number) <= (row.totalOnsets as number) &&
    (row.rightMatched as number) <= (row.rightExpected as number) &&
    (row.leftMatched as number) <= (row.leftExpected as number);
}
export function validateV5(value: unknown): V5Journal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_V5;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 5 || !Array.isArray(row.attempts)) return EMPTY_V5;
  return { schemaVersion: 5, attempts: row.attempts.filter(validAttempt).slice(-LIMIT) };
}
export function loadV5(): V5Journal {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? validateV5(JSON.parse(raw)) : EMPTY_V5;
  } catch { return EMPTY_V5; }
}
export function recordV5(attempt: V5Attempt): V5Journal {
  const previous = loadV5();
  if (!validAttempt(attempt)) return previous;
  const next: V5Journal = {
    schemaVersion: 5, attempts: [...previous.attempts, attempt].slice(-LIMIT)
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { /* practice remains usable if localStorage is blocked */ }
  return next;
}
