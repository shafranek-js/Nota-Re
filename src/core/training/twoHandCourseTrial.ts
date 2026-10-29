import { COURSE_CURRICULUM } from '../../data/curriculum.ts';
import type { TwoHandPattern } from './twoHandPractice.ts';
import type { TonalityKey } from '../../types/music';

/**
 * Lesson-linked, NON-CERTIFYING examples. These rhythm figures are not a
 * complete representation of lessons 11/12 and must never satisfy the
 * sequential lesson normative or write completedLessons.
 */
export type TwoHandTrialLessonId = 11 | 12;

export interface TwoHandCourseTrialPreset {
  readonly lessonId: TwoHandTrialLessonId;
  readonly title: string;
  readonly pattern: TwoHandPattern;
  readonly tonality: TonalityKey;
  readonly bpm: number;
  readonly description: string;
}

export function getTwoHandCourseTrialPreset(lessonId: number | null): TwoHandCourseTrialPreset | null {
  if (lessonId !== 11 && lessonId !== 12) return null;
  const lesson = COURSE_CURRICULUM.find(item => item.id === lessonId);
  if (!lesson) return null;
  return lessonId === 11
    ? {
        lessonId,
        title: 'Пробное двухручное чтение — урок 11',
        pattern: 'staggered',
        tonality: lesson.preset.tonality,
        bpm: lesson.preset.bpm,
        description: 'Бас вступает первым, мелодия — позже. Ритмический этюд приближён к траектории «Г», но не заменяет норматив урока.'
      }
    : {
        lessonId,
        title: 'Пробная координация рук — урок 12',
        pattern: 'eighth-rests',
        tonality: lesson.preset.tonality,
        bpm: lesson.preset.bpm,
        description: 'Восьмые, удержания и паузы тренируют независимость рук. Штрихи Ганона и аппликатура здесь ещё не оцениваются.'
      };
}
