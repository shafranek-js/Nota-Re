import type { AppMode } from '../../types/music';

/** Seven Lookahead scores, then eight Photo-memory scores (lesson 10). */
export const LESSON_TEN_LOOKAHEAD_SCORES = 7;

export function assessmentModeForLesson(
  lessonId: number | null, completedExercises: number, selectedMode: AppMode
): AppMode {
  if (lessonId !== 10) return selectedMode;
  return completedExercises >= LESSON_TEN_LOOKAHEAD_SCORES ? 'photo' : 'lookahead';
}

export function canCreditLessonMode(
  lessonId: number | null, completedExercises: number, mode: AppMode
): boolean {
  return lessonId !== 10 ||
    mode === assessmentModeForLesson(10, completedExercises, 'lookahead');
}
