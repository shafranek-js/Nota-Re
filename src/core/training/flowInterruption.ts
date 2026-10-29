/**
 * A hidden/suspended tab or delayed audio-clock callback can no longer
 * provide independent evidence for an in-progress timed course repetition.
 * Keep the current score visible for ungraded practice, but require a
 * deliberate relaunch of the lesson for credit.
 */
export function invalidateInterruptedTimedLesson() {
  return {
    isContinuousFlow: false,
    activeLessonId: null,
    completedExercisesCount: 0,
    isExerciseFlawless: false
  } as const;
}
