import type { AttemptEvent, AttemptOutcome } from './exerciseAttempt';

export type PracticeError = Extract<AttemptOutcome, 'wrong-pitch' | 'late' | 'missed'>;

export interface FeedbackDescription {
  kind: PracticeError;
  heading: string;
  detail: string;
  symbol: string;
}

/**
 * Describe the *observed event*, not a medical, motor or cognitive diagnosis.
 * A correct pitch after a rhythmic deadline is distinct from a wrong pitch;
 * silence is distinguished from either played answer.
 */
export function describeAttemptError(event: AttemptEvent): FeedbackDescription | null {
  const prefix = `Нота №${event.noteIndex + 1}`;
  if (event.outcome === 'wrong-pitch') {
    return {
      kind: 'wrong-pitch',
      symbol: '×',
      heading: 'Неверная нота',
      detail: `${prefix}: ожидалась ${event.expectedNote}, сыграна ${event.playedNote ?? 'неизвестная нота'}.`
    };
  }
  if (event.outcome === 'late') {
    const timing = event.reactionMs === null || !Number.isFinite(event.reactionMs)
      ? '' : ` · отклик ${Math.round(event.reactionMs)} мс`;
    return {
      kind: 'late',
      symbol: '⌛',
      heading: 'Поздний ответ',
      detail: `${prefix}: правильная высота ${event.expectedNote}, но после ритмического срока${timing}.`
    };
  }
  if (event.outcome === 'missed') {
    return {
      kind: 'missed',
      symbol: '—',
      heading: 'Пропуск',
      detail: `${prefix}: ${event.expectedNote} не была сыграна в отведённый ритмический слот.`
    };
  }
  return null;
}
