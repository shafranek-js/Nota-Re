import type { LessonEvidence } from '../training/flowTiming';

export const COURSE_SERIES_STORAGE_KEY = 'notare_course_series_v1';
export type CourseSeries = Partial<Record<number, LessonEvidence>>;

function validInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

/** Validate evidence, not just an unverified completed-exercise counter. */
export function validateLessonEvidence(input: unknown): LessonEvidence | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const e = input as Record<string, unknown>;
  if (!validInteger(e.completedExercises, 10000) ||
      !validInteger(e.judgedNotes, 1000000) ||
      !validInteger(e.correctNotes, 1000000) ||
      !validInteger(e.reactionSamples, 1000000) ||
      typeof e.reactionTotalMs !== 'number' || !Number.isFinite(e.reactionTotalMs) ||
      e.reactionTotalMs < 0 || e.reactionTotalMs > 1e12 ||
      e.correctNotes > e.judgedNotes || e.reactionSamples > e.correctNotes ||
      (e.completedExercises > 0 && e.judgedNotes < e.completedExercises)) return null;
  return {
    completedExercises: e.completedExercises, judgedNotes: e.judgedNotes,
    correctNotes: e.correctNotes, reactionTotalMs: e.reactionTotalMs,
    reactionSamples: e.reactionSamples
  };
}

export function validateCourseSeries(input: unknown): CourseSeries {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const parsed = input as Record<string, unknown>;
  if (parsed.version !== 1 || !parsed.lessons ||
      typeof parsed.lessons !== 'object' || Array.isArray(parsed.lessons)) return {};
  const series: CourseSeries = {};
  for (const [key, value] of Object.entries(parsed.lessons)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 1 || id > 12 || String(id) !== key) continue;
    const evidence = validateLessonEvidence(value);
    if (evidence) series[id] = evidence;
  }
  return series;
}

export function loadCourseSeriesFromStorage(): CourseSeries {
  try {
    const raw = localStorage.getItem(COURSE_SERIES_STORAGE_KEY);
    return raw ? validateCourseSeries(JSON.parse(raw)) : {};
  } catch { return {}; }
}

export function saveCourseSeriesToStorage(series: CourseSeries): void {
  try {
    const lessons = validateCourseSeries({ version: 1, lessons: series });
    localStorage.setItem(COURSE_SERIES_STORAGE_KEY, JSON.stringify({ version: 1, lessons }));
  } catch { /* storage may be unavailable; current session remains in memory */ }
}

export function clearCourseSeriesFromStorage(): void {
  try { localStorage.removeItem(COURSE_SERIES_STORAGE_KEY); }
  catch { /* unavailable storage */ }
}
