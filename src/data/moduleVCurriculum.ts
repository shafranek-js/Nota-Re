/**
 * Module V has its own stable, versioned namespace.
 * These are NOT numeric CourseLesson IDs and are never used for certification.
 */
export const MODULE_V_TRIADS_ID = 'module-v/v1/triads-5-3' as const;
export type ModuleVLessonId = typeof MODULE_V_TRIADS_ID;

export const MODULE_V_STAGES = [
  {
    id: MODULE_V_TRIADS_ID,
    title: 'Чтение трезвучия в основном виде (5/3)',
    summary: 'Найти три звука вертикали, прочитать основную ноту, терцию и квинту, сыграть одновременно.',
    available: true
  },
  {
    id: 'module-v/v1/inversions',
    title: 'Обращения 6 и 6/4',
    summary: 'Узнать обращение по басу без преждевременной подсказки.',
    available: false
  },
  {
    id: 'module-v/v1/left-textures',
    title: 'Фактуры левой руки',
    summary: 'Бас Альберти, вальс 3/4, ломаное арпеджио.',
    available: false
  },
  {
    id: 'module-v/v1/two-hands',
    title: 'Согласование двух рук',
    summary: 'Самостоятельные вступления, удержание звуков и ритм.',
    available: false
  },
  {
    id: 'module-v/v1/cadences',
    title: 'Гармонический минор: V–i',
    summary: 'Повышенная VII ступень, доминанта и разрешение в тонику.',
    available: false
  }
] as const;
