import type { AccompanimentTexture } from '../training/accompanimentStudy.ts';

const KEY = 'notare_module_v_left_textures_v3';
const MAX = 100;
export type V3Mode = 'guided' | 'independent';
export interface V3Attempt {
  readonly fixtureId: string;
  readonly mode: V3Mode;
  readonly response: AccompanimentTexture;
  readonly correct: boolean;
  readonly usedHint: boolean;
}
export interface V3Journal {
  readonly schemaVersion: 3;
  readonly attempts: readonly V3Attempt[];
  readonly midiRehearsals: readonly string[];
}
export const EMPTY_V3: V3Journal = { schemaVersion: 3, attempts: [], midiRehearsals: [] };
function validId(value: unknown): value is string {
  return typeof value === 'string' && /^v3-(0[1-9]|1[0-9]|2[0-4])$/.test(value);
}
function validAttempt(value: unknown): value is V3Attempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return validId(row.fixtureId) && (row.mode === 'guided' || row.mode === 'independent') &&
    (row.response === 'alberti' || row.response === 'waltz' || row.response === 'arpeggio') &&
    typeof row.correct === 'boolean' && typeof row.usedHint === 'boolean' &&
    !(row.mode === 'independent' && row.usedHint);
}
export function validateV3(value: unknown): V3Journal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_V3;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 3 || !Array.isArray(row.attempts) ||
      !Array.isArray(row.midiRehearsals)) return EMPTY_V3;
  return {
    schemaVersion: 3,
    attempts: row.attempts.filter(validAttempt).slice(-MAX),
    midiRehearsals: [...new Set(row.midiRehearsals.filter((v): v is string =>
      typeof v === 'string' && /^v3-(0[1-9]|1[0-9]|2[0-4]):(0|12)$/.test(v)))].slice(-MAX)
  };
}
export function loadV3(): V3Journal {
  try { const value = localStorage.getItem(KEY); return value ? validateV3(JSON.parse(value)) : EMPTY_V3; }
  catch { return EMPTY_V3; }
}
function save(next: V3Journal): V3Journal {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* optional, ungraded */ }
  return next;
}
/** Independent from V1, V2, courses and the generic Studio practice stats. */
export function recordV3Attempt(attempt: V3Attempt): V3Journal {
  const previous = loadV3();
  if (!validAttempt(attempt)) return previous;
  return save({ ...previous, attempts: [...previous.attempts, attempt].slice(-MAX) });
}
export function recordV3MidiRehearsal(fixtureId: string, shift: 0 | 12): V3Journal {
  const previous = loadV3();
  if (!validId(fixtureId) || (shift !== 0 && shift !== 12)) return previous;
  const marker = fixtureId + ':' + shift;
  if (previous.midiRehearsals.includes(marker)) return previous;
  return save({ ...previous, midiRehearsals: [...previous.midiRehearsals, marker].slice(-MAX) });
}
