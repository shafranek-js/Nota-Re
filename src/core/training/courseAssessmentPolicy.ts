/** Single-note exercises cannot verify independent hands or articulation. */
export function isTwoHandCourseLesson(lessonId: number | null): boolean {
  return lessonId === 11 || lessonId === 12;
}

export function allowsAutomaticLessonCredit(lessonId: number | null): boolean {
  return lessonId !== null && Number.isInteger(lessonId) &&
    lessonId >= 1 && lessonId <= 10;
}

/** Raw visual-to-key delay is not a measured rhythm or motor proficiency.
 * Speed targets remain optional diagnostics in *all* course lessons. */
export function requiresSpeedForLessonCredit(_lessonId: number | null): boolean {
  return false;
}

/** Honest, lesson-specific limits of what note-on events can establish. */
export function lessonAssessmentCaveat(lessonId: number): string {
  switch (lessonId) {
    case 1: return 'Проверяется чтение и точность нот, но не выполнение доигрового анализа.';
    case 2: return 'Проверяется чтение и точность нот; отсутствие мысленного проговаривания не измеряется.';
    case 3: return 'В потоке ошибки, запоздания и пропуски снижают точность; музыкальную выразительность MIDI не измеряет.';
    case 4: return 'Проверяются ноты, но не произнесение ритмослогов и не точность их интонации.';
    case 5: return 'Проверяется чтение басового ключа, но не постановка левой руки.';
    case 6: return 'Проверяется чтение нот, но не правильность пения и слухового предслышания.';
    case 7: return 'Проверяются ноты, но не выбранная учеником стратегия интервального чтения.';
    case 8: return 'Проверяются ноты со знаками и диапазоном, но не заблаговременная подготовка руки.';
    case 9: return 'Проверяется точность, но приложение не узнаёт, смотрели ли вы на клавиатуру.';
    case 10: return 'Для зачёта нужны 7 упражнений «Бегунок» и 8 «Фото-память»; реальное направление взгляда не измеряется.';
    case 11: return 'Автоматический зачёт отключён: синхронность двух рук не доказывает правильный взгляд и аппликатуру.';
    case 12: return 'Автоматический зачёт отключён: MIDI не подтверждает независимость штрихов, качество legato и посадку.';
    default: return 'Недоступен автоматический зачёт.';
  }
}
