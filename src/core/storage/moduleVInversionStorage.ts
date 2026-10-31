import type { TriadFigure } from '../notation/intervalGuides.ts';

const STORAGE_KEY = 'notare_module_v_inversions_v2';
const MAX_ATTEMPTS = 100;

export type InversionPracticeMode = 'guided' | 'independent';

export interface ModuleVInversionAttempt {
  readonly fixtureId: string;
  readonly mode: InversionPracticeMode;
  readonly response: TriadFigure;
  readonly correct: boolean;
  readonly usedHint: boolean;
}
export interface ModuleVInversionPractice {
  readonly schemaVersion: 2;
  readonly attempts: readonly ModuleVInversionAttempt[];
}
export const EMPTY_MODULE_V_INVERSIONS: ModuleVInversionPractice =
  { schemaVersion: 2, attempts: [] };

function validAttempt(value: unknown): value is ModuleVInversionAttempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const id = row.fixtureId;
  return typeof id === 'string' && /^v2-(0[1-9]|1[0-9]|2[0-4])$/.test(id) &&
    (row.mode === 'guided' || row.mode === 'independent') &&
    (row.response === '5/3' || row.response === '6' || row.response === '6/4') &&
    typeof row.correct === 'boolean' && typeof row.usedHint === 'boolean' &&
    !(row.mode === 'independent' && row.usedHint);
}

export function validateModuleVInversions(value: unknown): ModuleVInversionPractice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_MODULE_V_INVERSIONS;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 2 || !Array.isArray(record.attempts)) return EMPTY_MODULE_V_INVERSIONS;
  return { schemaVersion: 2, attempts: record.attempts.filter(validAttempt).slice(-MAX_ATTEMPTS) };
}

export function loadModuleVInversions(): ModuleVInversionPractice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? validateModuleVInversions(JSON.parse(saved)) : EMPTY_MODULE_V_INVERSIONS;
  } catch {
    return EMPTY_MODULE_V_INVERSIONS;
  }
}

/** V2 never reads or modifies V1, course, certificate or shadow-grade keys. */
export function recordModuleVInversion(attempt: ModuleVInversionAttempt): ModuleVInversionPractice {
  const previous = loadModuleVInversions();
  if (!validAttempt(attempt)) return previous;
  const next: ModuleVInversionPractice = {
    schemaVersion: 2,
    attempts: [...previous.attempts, attempt].slice(-MAX_ATTEMPTS)
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch { /* Restricted storage does not block practice. */ }
  return next;
}
