import type { ExerciseNote, TonalityKey } from '../../types/music';

export interface PreplayStep {
  readonly number: number;
  readonly title: string;
  readonly detail: string;
}

const KEY_SIGNATURES: Record<TonalityKey, string> = {
  C: 'До мажор / ля минор: без ключевых знаков',
  G: 'Соль мажор / ми минор: Фа♯',
  F: 'Фа мажор / ре минор: Си♭',
  D: 'Ре мажор / си минор: Фа♯ и До♯'
};

/**
 * Derive only verifiable data from the generated score. An exercise is not
 * necessarily an imported musical work: composer and time signature do not
 * exist in its note model, and must never be invented for the checklist.
 */
export function analyzePreplayScore(input: {
  readonly notes: readonly Pick<ExerciseNote, 'noteName' | 'clef' | 'durMultiplier'>[];
  readonly tonality: TonalityKey;
  readonly bpm: number;
  readonly lessonTitle?: string;
}): readonly PreplayStep[] {
  const clefs = [...new Set(input.notes.map(note => note.clef))];
  const clefNames = clefs.map(clef => clef === 'treble' ? 'скрипичный' : 'басовый');
  const first = input.notes[0];
  const duration = input.notes
    .map(note => note.durMultiplier)
    .filter(value => Number.isFinite(value) && value > 0);
  const shortest = duration.length ? Math.min(...duration) : null;
  return [
    {
      number: 1,
      title: 'Название и характер',
      detail: input.lessonTitle
        ? `Материал: ${input.lessonTitle}. Название пьесы, композитор и характер не указаны в генераторе.`
        : 'Свободное упражнение. Название пьесы, композитор и характер не указаны.'
    },
    {
      number: 2,
      title: 'Тональность и ключевые знаки',
      detail: KEY_SIGNATURES[input.tonality]
    },
    {
      number: 3,
      title: 'Размер и пульс',
      detail: `Темп: ${input.bpm} BPM (четверть). Размер и тактовый метр не заданы в модели упражнения — не следует угадывать их по записи.`
    },
    {
      number: 4,
      title: 'Ключи и начальная нота',
      detail: `Ключи: ${clefNames.join(' и ') || 'не определены'}. ${first ? `Начальная нота: ${first.noteName}.` : 'Стартовая нота отсутствует.'}`
    },
    {
      number: 5,
      title: 'Ритм и сложные места',
      detail: shortest !== null
        ? `Наименьшая длительность в текущем упражнении: ${shortest} четвертной доли. Удобный темп для проверки: ${input.bpm} BPM.`
        : 'В упражнении пока нет известных длительностей.'
    }
  ];
}
