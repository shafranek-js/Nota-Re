/** Separate V4 teaching evidence. Never writes certified course or V1–V3 keys. */
const KEY = 'notare_module_v_coordination_v4';
const LIMIT = 60;
export interface V4Attempt {
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
export interface V4Journal {
  readonly schemaVersion: 4;
  readonly attempts: readonly V4Attempt[];
}
export const EMPTY_V4: V4Journal = { schemaVersion: 4, attempts: [] };
function validAttempt(value: unknown): value is V4Attempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.fixtureId !== 'string' ||
      !/^v4-(0[1-9]|1[0-9]|2[0-4])$/.test(row.fixtureId) ||
      !Number.isSafeInteger(row.bpm) || (row.bpm as number) < 40 || (row.bpm as number) > 100 ||
      typeof row.clean !== 'boolean') return false;
  const fields = ['matchedOnsets','totalOnsets','rightMatched','rightExpected',
    'leftMatched','leftExpected','misses','wrongPitches','offBeatNotes',
    'earlyReleases','overheldNotes','interruptions'] as const;
  if (!fields.every(k => Number.isSafeInteger(row[k]) && (row[k] as number) >= 0 &&
      (row[k] as number) <= 100)) return false;
  if ((row.matchedOnsets as number) > (row.totalOnsets as number) ||
      (row.rightMatched as number) > (row.rightExpected as number) ||
      (row.leftMatched as number) > (row.leftExpected as number)) return false;
  return true;
}
export function validateV4(value: unknown): V4Journal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_V4;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 4 || !Array.isArray(row.attempts)) return EMPTY_V4;
  return { schemaVersion: 4, attempts: row.attempts.filter(validAttempt).slice(-LIMIT) };
}
export function loadV4(): V4Journal {
  try { const raw = localStorage.getItem(KEY); return raw ? validateV4(JSON.parse(raw)) : EMPTY_V4; }
  catch { return EMPTY_V4; }
}
export function recordV4(attempt: V4Attempt): V4Journal {
  const previous = loadV4();
  if (!validAttempt(attempt)) return previous;
  const next: V4Journal = {
    schemaVersion: 4, attempts: [...previous.attempts, attempt].slice(-LIMIT)
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* opt-in practice still works */ }
  return next;
}
