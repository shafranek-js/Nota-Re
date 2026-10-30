/** Single-note exercises cannot verify independent hands or articulation. */
export function isTwoHandCourseLesson(lessonId: number | null): boolean {
  return lessonId === 11 || lessonId === 12;
}

export function allowsAutomaticLessonCredit(lessonId: number | null): boolean {
  return lessonId !== null && Number.isInteger(lessonId) &&
    lessonId >= 1 && lessonId <= 10;
}
