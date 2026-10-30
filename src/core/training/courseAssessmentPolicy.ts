/** Single-note exercises cannot verify independent hands or articulation. */
export function isTwoHandCourseLesson(lessonId: number | null): boolean {
  return lessonId === 11 || lessonId === 12;
}

export function allowsAutomaticLessonCredit(lessonId: number | null): boolean {
  return lessonId !== null && Number.isInteger(lessonId) &&
    lessonId >= 1 && lessonId <= 10;
}

/** The first lesson certifies note recognition; speed is a separate optional drill. */
export function requiresSpeedForLessonCredit(lessonId: number | null): boolean {
  return lessonId !== 1;
}
