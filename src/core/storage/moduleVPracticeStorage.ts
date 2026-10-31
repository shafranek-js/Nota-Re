import { MODULE_V_TRIADS_ID } from '../../data/moduleVCurriculum.ts';

const STORAGE_KEY = 'notare_module_v_practice_v1';
const FIXTURE_ID = 'C-major-5-3' as const;

/** Independent ungraded evidence; no old course progress keys are read/written. */
export interface ModuleVPractice {
  readonly schemaVersion: 1;
  readonly completedFixtures: readonly (typeof FIXTURE_ID)[];
}
export const EMPTY_MODULE_V_PRACTICE: ModuleVPractice =
  { schemaVersion: 1, completedFixtures: [] };

export function validateModuleVPractice(value: unknown): ModuleVPractice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_MODULE_V_PRACTICE;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !Array.isArray(record.completedFixtures)) {
    return EMPTY_MODULE_V_PRACTICE;
  }
  return {
    schemaVersion: 1,
    completedFixtures: record.completedFixtures.includes(FIXTURE_ID) ? [FIXTURE_ID] : []
  };
}

export function loadModuleVPractice(): ModuleVPractice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? validateModuleVPractice(JSON.parse(saved)) : EMPTY_MODULE_V_PRACTICE;
  } catch {
    return EMPTY_MODULE_V_PRACTICE;
  }
}

/**
 * Only record after the genuine four-chord MIDI reducer finishes the fixed
 * C-major score. This does NOT grade rhythm, fingering or course completion.
 */
export function recordModuleVTriadPractice(lessonId: string): ModuleVPractice {
  if (lessonId !== MODULE_V_TRIADS_ID) return loadModuleVPractice();
  const previous = loadModuleVPractice();
  if (previous.completedFixtures.includes(FIXTURE_ID)) return previous;
  const next: ModuleVPractice = { schemaVersion: 1, completedFixtures: [FIXTURE_ID] };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch { /* blocked storage never prevents a live practice session */ }
  return next;
}
