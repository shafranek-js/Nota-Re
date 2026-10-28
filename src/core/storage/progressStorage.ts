const STORAGE_KEY = 'notare_course_completed_v3';

export function validateCompletedLessons(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  // Keep valid and unique completed lesson IDs in their original order.
  // Malformed legacy storage must never inflate the visible course progress.
  return [...new Set(input.filter(
    (id): id is number => Number.isInteger(id) && id >= 1 && id <= 12
  ))];
}

export function loadCourseProgressFromStorage(): number[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? validateCompletedLessons(JSON.parse(saved)) : [];
  } catch {
    // Invalid JSON and inaccessible storage must never prevent app startup.
    return [];
  }
}

export function saveCourseProgressToStorage(completedIds: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validateCompletedLessons(completedIds)));
  } catch {
    // Ignore storage quota/permission errors without losing in-memory state.
  }
}

export function clearCourseProgressFromStorage(): void {
  try { localStorage.removeItem(STORAGE_KEY); }
  catch { /* private browsing or storage errors */ }
}
