import { lessonTwoHandStudyCount } from '../training/lessonTwoHandScore.ts';
import { initialShadowSeries, type ShadowSeriesState } from '../training/twoHandShadowSeries.ts';
import type { TwoHandTrialLessonId } from '../training/twoHandCourseTrial.ts';

/**
 * Versioned local record of provisional, fully completed mini-studies.
 * No real-time MIDI input or official course-certification data is stored.
 */
export const TWO_HAND_SHADOW_STORAGE_KEY = 'notare_two_hand_shadow_v1';

function validInt(value: unknown, maximum = 1000000): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= 0 && value <= maximum;
}

export function validateSavedTwoHandSeries(
  lessonId: TwoHandTrialLessonId, candidate: unknown
): ShadowSeriesState | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const input = candidate as Record<string, unknown>;
  const { attempts, accepted, rejected, aborted, cleanStreak, lastAttemptId, successfulStudies } = input;
  if (!validInt(attempts) || !validInt(accepted) || !validInt(rejected) ||
      !validInt(aborted) || !validInt(cleanStreak) || !validInt(lastAttemptId) ||
      !Array.isArray(successfulStudies)) return null;
  const max = lessonTwoHandStudyCount(lessonId);
  if (successfulStudies.length > max ||
      !successfulStudies.every((index: unknown) => validInt(index, max - 1)) ||
      new Set(successfulStudies).size !== successfulStudies.length ||
      attempts !== accepted + rejected + aborted ||
      lastAttemptId < attempts || accepted < successfulStudies.length ||
      cleanStreak > successfulStudies.length ||
      (lessonId === 11 && cleanStreak !== successfulStudies.length)) return null;
  return {
    lessonId, attempts, accepted, rejected, aborted, cleanStreak,
    successfulStudies: [...successfulStudies] as number[],
    lastAttemptId, lastVerdict: null,
    practiceTargetReached: successfulStudies.length >= max
  };
}

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(TWO_HAND_SHADOW_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const data = parsed as Record<string, unknown>;
    if (data.version !== 1 || !data.lessons ||
        typeof data.lessons !== 'object' || Array.isArray(data.lessons)) return {};
    return data.lessons as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadTwoHandShadowSeries(
  lessonId: TwoHandTrialLessonId | null
): ShadowSeriesState {
  if (lessonId === null) return initialShadowSeries(null);
  return validateSavedTwoHandSeries(lessonId, readAll()[String(lessonId)]) ??
    initialShadowSeries(lessonId);
}

export function saveTwoHandShadowSeries(series: ShadowSeriesState): void {
  if (series.lessonId === null) return;
  const snapshot = {
    attempts: series.attempts, accepted: series.accepted,
    rejected: series.rejected, aborted: series.aborted,
    cleanStreak: series.cleanStreak,
    successfulStudies: [...series.successfulStudies],
    lastAttemptId: series.lastAttemptId
  };
  if (!validateSavedTwoHandSeries(series.lessonId, snapshot)) return;
  try {
    const lessons = { ...readAll(), [String(series.lessonId)]: snapshot };
    localStorage.setItem(TWO_HAND_SHADOW_STORAGE_KEY,
      JSON.stringify({ version: 1, lessons }));
  } catch {
    // Storage may be disabled or full. The in-memory practice still works.
  }
}

export function clearTwoHandShadowSeries(lessonId: TwoHandTrialLessonId): void {
  try {
    const lessons = { ...readAll() };
    delete lessons[String(lessonId)];
    localStorage.setItem(TWO_HAND_SHADOW_STORAGE_KEY,
      JSON.stringify({ version: 1, lessons }));
  } catch { /* storage unavailable */ }
}

export function clearAllTwoHandShadowSeries(): void {
  try { localStorage.removeItem(TWO_HAND_SHADOW_STORAGE_KEY); }
  catch { /* storage unavailable */ }
}
