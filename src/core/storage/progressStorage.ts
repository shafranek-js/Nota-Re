const STORAGE_KEY = 'notare_course_completed_v3';

export function loadCourseProgressFromStorage(): number[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return [];
}

export function saveCourseProgressToStorage(completedIds: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedIds));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCourseProgressFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
