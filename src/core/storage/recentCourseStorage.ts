import type { GradedScore, RecentCourseWindows } from '../training/recentCourseWindow';

export const RECENT_COURSE_STORAGE_KEY = 'notare_course_recent_v2';
const MAX_SCORES = 20;

function validScore(value: unknown): value is GradedScore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  const count = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= 10000;
  return typeof s.mode === 'string' &&
    ['reflex', 'rhythm', 'lookahead', 'photo', 'intervals', 'gpattern', 'blind', 'hanon'].includes(s.mode) &&
    count(s.judgedNotes) && count(s.correctNotes) && count(s.reactionSamples) &&
    (s.correctNotes as number) <= (s.judgedNotes as number) &&
    (s.reactionSamples as number) <= (s.correctNotes as number) &&
    typeof s.reactionTotalMs === 'number' && Number.isFinite(s.reactionTotalMs) &&
    s.reactionTotalMs >= 0 && s.reactionTotalMs <= 1e10 &&
    (s.judgedNotes as number) > 0;
}

export function validateRecentCourseStorage(input: unknown): RecentCourseWindows {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  if (record.version !== 2 || !record.lessons ||
      typeof record.lessons !== 'object' || Array.isArray(record.lessons)) return {};
  const result: RecentCourseWindows = {};
  for (const [idText, raw] of Object.entries(record.lessons)) {
    const id = Number(idText);
    if (!Number.isInteger(id) || id < 1 || id > 10 ||
        String(id) !== idText || !Array.isArray(raw) || raw.length > MAX_SCORES ||
        !raw.every(validScore)) continue;
    result[id] = raw.map(item => ({ mode: item.mode, judgedNotes: item.judgedNotes,
      correctNotes: item.correctNotes, reactionSamples: item.reactionSamples,
      reactionTotalMs: item.reactionTotalMs }));
  }
  return result;
}

export function loadRecentCourseWindows(): RecentCourseWindows {
  try {
    const raw = localStorage.getItem(RECENT_COURSE_STORAGE_KEY);
    return raw ? validateRecentCourseStorage(JSON.parse(raw)) : {};
  } catch { return {}; }
}
export function saveRecentCourseWindows(windows: RecentCourseWindows): void {
  try {
    const validated = validateRecentCourseStorage({ version: 2, lessons: windows });
    localStorage.setItem(RECENT_COURSE_STORAGE_KEY, JSON.stringify({
      version: 2, lessons: validated
    }));
  } catch { /* unavailable storage: continue the live session */ }
}
export function clearRecentCourseWindows(): void {
  try { localStorage.removeItem(RECENT_COURSE_STORAGE_KEY); }
  catch { /* browser denied storage */ }
}
