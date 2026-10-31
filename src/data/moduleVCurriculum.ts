/**
 * Module V has its own stable, versioned namespace.
 * These are NOT numeric CourseLesson IDs and are never used for certification.
 */
export const MODULE_V_TRIADS_ID = 'module-v/v1/triads-5-3' as const;
export const MODULE_V_INVERSIONS_ID = 'module-v/v1/inversions' as const;
export const MODULE_V_LEFT_TEXTURES_ID = 'module-v/v1/left-textures' as const;
export const MODULE_V_TWO_HANDS_ID = 'module-v/v1/two-hands' as const;
export type ModuleVLessonId = typeof MODULE_V_TRIADS_ID; // V2 reads and responds within the Module V route, not the graded trainer.

export const MODULE_V_STAGES = [
  {
    id: MODULE_V_TRIADS_ID,
    title: 'Чтение трезвучия в основном виде (5/3)',
    summary: 'Найти три звука вертикали, прочитать основную ноту, терцию и квинту, сыграть одновременно.',
    available: true
  },
  {
    id: MODULE_V_INVERSIONS_ID,
    title: 'Основной вид и обращения 5/3, 6, 6/4',
    summary: 'Самостоятельно определить обращение по настоящему нотному тексту.',
    available: true
  },
  {
    id: MODULE_V_LEFT_TEXTURES_ID,
    title: 'Чтение фактур левой руки',
    summary: 'Распознать по нотам бас Альберти, настоящий вальс 3/4 и ломаное арпеджио, затем попробовать на MIDI.',
    available: true
  },
  {
    id: MODULE_V_TWO_HANDS_ID,
    title: 'Координация двух рук',
    summary: 'Реальные независимые MIDI-атаки, ритм и физическое отпускание нот — с видимой партитурой и отсчётом.',
    available: true
  },
  {
    id: 'module-v/v1/cadences',
    title: 'Гармонический минор: V–i',
    summary: 'Повышенная VII ступень, доминанта и разрешение в тонику.',
    available: false
  }
] as const;
