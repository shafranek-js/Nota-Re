import { emptyPracticeStats, validatePracticeStats, type PracticeStats } from '../training/practiceStatistics.ts';

export const PRACTICE_STATS_STORAGE_KEY = 'notare_adaptive_practice_stats_v1';
const MAX_JSON_SIZE = 260000;

/** Separate from all certification and course progress keys. Never sync. */
export function loadPracticeStats(storage: Pick<Storage, 'getItem'> | null =
  typeof localStorage === 'undefined' ? null : localStorage): PracticeStats {
  if (!storage) return emptyPracticeStats();
  try {
    const raw = storage.getItem(PRACTICE_STATS_STORAGE_KEY);
    if (!raw || raw.length > MAX_JSON_SIZE) return emptyPracticeStats();
    return validatePracticeStats(JSON.parse(raw));
  } catch {
    return emptyPracticeStats();
  }
}
export function savePracticeStats(stats: PracticeStats,
  storage: Pick<Storage, 'setItem'> | null =
    typeof localStorage === 'undefined' ? null : localStorage): boolean {
  if (!storage) return false;
  try {
    const validated = validatePracticeStats(stats);
    const json = JSON.stringify(validated);
    if (json.length > MAX_JSON_SIZE) return false;
    storage.setItem(PRACTICE_STATS_STORAGE_KEY, json);
    return true;
  } catch {
    return false; // quota/private mode must never affect course play
  }
}
export function clearPracticeStats(storage: Pick<Storage, 'removeItem'> | null =
  typeof localStorage === 'undefined' ? null : localStorage): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(PRACTICE_STATS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
