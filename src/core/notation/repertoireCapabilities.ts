import type { ScoreDocument } from './scoreDocument';

/**
 * Evidence-backed feature inventory for imported MusicXML.
 * A successful OSMD rendering is not proof that the XML can be transformed
 * into performance targets. All certification remains disabled here.
 */
export interface RepertoireInspectorInput {
  readonly rendered: boolean;
  readonly score: ScoreDocument | null;
  readonly parsingReason: string | null;
  readonly measureGeometryReady: boolean;
  readonly measureGeometryReason: string | null;
  readonly noteMapping: {
    readonly matched: number;
    readonly total: number;
    readonly reason: string | null;
  } | null;
}

export type RepertoireFeatureKey =
  | 'view' | 'timeline' | 'measure-selection' | 'notehead-overlay' | 'audio-loop' | 'assessment';

export interface RepertoireFeature {
  readonly key: RepertoireFeatureKey;
  readonly label: string;
  readonly available: boolean;
  /** Explicit reason, including the safe scope when available. */
  readonly explanation: string;
}

export function inspectRepertoireCapabilities(
  input: RepertoireInspectorInput
): readonly RepertoireFeature[] {
  const scoreReady = input.rendered && input.score !== null;
  const measureReady = scoreReady && input.measureGeometryReady &&
    input.measureGeometryReason === null;
  const notes = input.score?.events.filter(event => event.kind === 'note').length ?? 0;
  const noteReady = measureReady && !!input.noteMapping &&
    input.noteMapping.reason === null && input.noteMapping.total > 0 &&
    input.noteMapping.matched === input.noteMapping.total;
  const structuralFailure = !input.rendered
    ? 'OSMD ещё не завершил построение партитуры.'
    : input.parsingReason ?? 'Структуру MusicXML нельзя однозначно преобразовать во временную шкалу.';
  const measureFailure = !scoreReady ? structuralFailure
    : input.measureGeometryReason ??
      'Границы всех тактов пока не подтверждены по реальной гравировке OSMD.';
  const noteFailure = !measureReady ? measureFailure
    : input.noteMapping?.reason ??
      'Не все нотные головки однозначно сопоставлены с событиями MusicXML.';
  return [
    {
      key: 'view', label: 'Нотный просмотр', available: input.rendered,
      explanation: input.rendered ? 'Исходная партитура показана движком OSMD.'
        : 'OSMD не завершил отображение исходной партитуры.'
    },
    {
      key: 'timeline', label: 'Музыкальная структура', available: scoreReady,
      explanation: scoreReady
        ? 'Распознаны события, голоса и музыкальное время без изменения MusicXML.'
        : structuralFailure
    },
    {
      key: 'measure-selection', label: 'Выделение тактов A–B', available: measureReady,
      explanation: measureReady ? 'Границы тактов подтверждены координатами OSMD.'
        : measureFailure
    },
    {
      key: 'notehead-overlay', label: 'Подсветка отдельных нот', available: noteReady,
      explanation: noteReady
        ? `Однозначно сопоставлены ${input.noteMapping!.matched} из ${input.noteMapping!.total} нот.`
        : noteFailure
    },
    {
      key: 'audio-loop', label: 'Звуковой повтор A–B',
      available: measureReady && notes > 0,
      explanation: !measureReady ? measureFailure : notes === 0
        ? 'В партитуре нет звучащих нот.'
        : 'Доступен после выбора тактов; нужен включённый звук. Это прослушивание, не оценка.'
    },
    {
      key: 'assessment', label: 'Тренировка с зачётом', available: false,
      explanation: 'Импортированные произведения не участвуют в зачёте курса. Точное сопоставление MIDI, голосов и ритма ещё не аттестовано.'
    }
  ] as const;
}
