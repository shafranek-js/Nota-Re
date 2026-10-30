import React, { useEffect, useRef } from 'react';
import { ArrowRight, CircleMinus, CircleX, Clock3, RotateCcw, Settings2, Shuffle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { COURSE_CURRICULUM } from '../../../data/curriculum';
import type { AttemptEvent, AttemptOutcome } from '../../../core/training/exerciseAttempt';
import { useAppStore } from '../../../store/useAppStore';

const MODE_NAMES: Record<string, string> = {
  reflex: 'Рефлекс', rhythm: 'Ритмослоги', lookahead: 'Бегунок (+1)',
  photo: 'Фото-память', intervals: 'Интервалы', gpattern: 'Буква «Г»',
  blind: 'Вслепую', hanon: 'Ганон и штрихи'
};

type ErrorOutcome = Exclude<AttemptOutcome, 'correct' | 'assisted'>;

/** Different shapes, labels and borders: the feedback is not color-only. */
const ERROR_PRESENTATION: Record<ErrorOutcome, { label: string; Icon: LucideIcon; style: string }> = {
  'wrong-pitch': {
    label: 'Неверная нота', Icon: CircleX,
    style: 'border-rose-500/50 bg-rose-500/10 text-rose-200'
  },
  late: {
    label: 'Поздний ответ', Icon: Clock3,
    style: 'border-amber-500/50 bg-amber-500/10 text-amber-200'
  },
  missed: {
    label: 'Пропуск', Icon: CircleMinus,
    style: 'border-slate-600 bg-slate-800/60 text-slate-200'
  }
};

function describeError(event: AttemptEvent): string {
  const expected = `Нота №${event.noteIndex + 1} · ожидалась ${event.expectedNote}`;
  return event.playedNote === null
    ? `${expected} · ответ не получен`
    : `${expected} · сыграна ${event.playedNote}`;
}

/**
 * This is a normal replacement workspace, not an overlay with hidden
 * background controls. Focus moves to its heading and exits naturally
 * through the visible action buttons.
 */
export const AttemptResultCard: React.FC = () => {
  const {
    lastAttemptResult, retryExercise, regenerateExercise,
    returnToTrainerSetup, goToNextLessonAndStart, switchWorkspace, courseEvidence
  } = useAppStore();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (!lastAttemptResult) return null;

  const result = lastAttemptResult;
  const lesson = COURSE_CURRICULUM.find(item => item.id === result.lessonId);
  const hasCertification = result.lessonPassed && !!lesson;
  const seriesAccuracy = courseEvidence.judgedNotes > 0
    ? 100 * courseEvidence.correctNotes / courseEvidence.judgedNotes : null;
  const seriesReaction = courseEvidence.reactionSamples > 0
    ? courseEvidence.reactionTotalMs / courseEvidence.reactionSamples : null;
  const errors = result.events.filter(event =>
    event.outcome === 'wrong-pitch' || event.outcome === 'late' || event.outcome === 'missed'
  );
  const description = result.assistedSteps > 0
    ? 'Использовалась подсказка. Эта попытка не засчитывается как самостоятельное выполнение.'
    : hasCertification
      ? 'Норматив урока выполнен. Можно перейти к следующему уроку.'
      : lesson && result.creditEligible
        ? 'Упражнение выполнено самостоятельно. Продолжайте зачётную серию.'
        : lesson
          ? 'Норматив пока не выполнен. Ошибки и пропуски показаны ниже.'
          : 'Результат свободной практики. Зачёт урока не выполнялся.';

  return (
    <section data-testid="attempt-results" aria-labelledby="attempt-result-heading"
      className="flex-1 min-h-0 w-full overflow-y-auto p-3 sm:p-6 flex justify-center items-start">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-xl p-4 sm:p-7 space-y-5">
        <div className="space-y-1">
          <p className="text-xs uppercase font-semibold tracking-widest text-sky-300">Результаты упражнения</p>
          <h2 id="attempt-result-heading" ref={headingRef} tabIndex={-1}
            className="text-xl sm:text-2xl font-bold text-white outline-none">
            {lesson ? `Урок ${lesson.id}: ${lesson.title}` : 'Свободная практика'}
          </h2>
          <p className="text-sm text-slate-400">
            {MODE_NAMES[result.mode] ?? result.mode} · {result.tonality} · {result.bpm} BPM · {result.noteCount} нот
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" aria-label="Показатели попытки">
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <p className="text-xs text-slate-400">Верных ответов</p>
            <p data-testid="attempt-correct" className="text-xl font-semibold text-emerald-300 tabular-nums">
              {result.correctHits} / {result.judgedEvents}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <p className="text-xs text-slate-400">Точность</p>
            <p data-testid="attempt-accuracy" className="text-xl font-semibold text-white tabular-nums">
              {result.accuracyPercent === null ? '—' : `${Math.round(result.accuracyPercent)}%`}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <p className="text-xs text-slate-400">Отклик</p>
            <p data-testid="attempt-reaction" className="text-xl font-semibold text-white tabular-nums">
              {result.averageReactionMs === null ? '—' : `${Math.round(result.averageReactionMs)} мс`}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <p className="text-xs text-slate-400">Ошибки / пропуски</p>
            <p data-testid="attempt-errors-count" className="text-xl font-semibold text-amber-300 tabular-nums">
              {result.wrongPitches + result.lateHits + result.missedSlots}
            </p>
          </div>
        </div>

        <p role="status" data-testid="attempt-verdict"
          className={`rounded-lg border px-3 py-2 text-sm ${hasCertification
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
            : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
          {description}
        </p>

        {lesson && (
          <section data-testid="course-series-summary" className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 space-y-1">
            <strong className="block text-emerald-300">Зачётная серия: {courseEvidence.completedExercises} / {lesson.normReps} упражнений</strong>
            <p>Точность серии: {seriesAccuracy === null ? '—' : `${seriesAccuracy.toFixed(1)}%`} (нужно ≥{lesson.normAcc}%).</p>
            <p>Средний отклик: {seriesReaction === null ? '—' : `${Math.round(seriesReaction)} мс`} (нужно ≤{lesson.normSpeed} мс).</p>
            {!hasCertification && <p className="text-amber-200">
              {courseEvidence.completedExercises < lesson.normReps
                ? `Осталось завершить минимум ${lesson.normReps - courseEvidence.completedExercises} упражнений.`
                : seriesAccuracy === null || seriesAccuracy < lesson.normAcc
                  ? 'Точность ниже норматива. Продолжайте самостоятельную практику в зачётном режиме.'
                  : 'Проверьте скорость реакции: нужны измеренные своевременные ответы.'}
            </p>}
          </section>
        )}
        {result.assistedSteps > 0 && (
          <p data-testid="attempt-assisted-count" className="text-xs text-amber-300">
            Шагов с подсказками: {result.assistedSteps}. Они не учитываются в точности.
          </p>
        )}

        {errors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Что проверить</h3>
            <div role="group" aria-label="Ошибки по типам" data-testid="attempt-error-breakdown"
              className="flex flex-wrap gap-2 text-xs">
              {result.wrongPitches > 0 && (
                <span data-testid="attempt-wrong-pitch-count"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/10 px-2.5 py-1.5 text-rose-200">
                  <CircleX aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Неверная нота: {result.wrongPitches}
                </span>
              )}
              {result.lateHits > 0 && (
                <span data-testid="attempt-late-count"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-amber-200">
                  <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Поздний ответ: {result.lateHits}
                </span>
              )}
              {result.missedSlots > 0 && (
                <span data-testid="attempt-missed-count"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/60 px-2.5 py-1.5 text-slate-200">
                  <CircleMinus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Пропуск: {result.missedSlots}
                </span>
              )}
            </div>
            <ul className="space-y-1.5 text-xs">
              {errors.slice(0, 6).map((event, i) => {
                const presentation = ERROR_PRESENTATION[event.outcome as ErrorOutcome];
                const ErrorIcon = presentation.Icon;
                return (
                  <li key={i} data-testid="attempt-error-event" data-outcome={event.outcome}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${presentation.style}`}>
                    <ErrorIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <strong className="block font-semibold">{presentation.label}</strong>
                      <span className="block text-slate-300">{describeError(event)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {errors.length > 6 && <p className="text-xs text-slate-400">Ещё событий: {errors.length - 6}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
          <button type="button" onClick={retryExercise} data-testid="retry-exercise"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 text-sm font-bold">
            <RotateCcw className="w-4 h-4" /> Ещё раз
          </button>
          <button type="button" onClick={regenerateExercise}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-2 text-sm font-semibold">
            <Shuffle className="w-4 h-4" /> Новое упражнение
          </button>
          {hasCertification && lesson && lesson.id < COURSE_CURRICULUM.length && (
            <button type="button" onClick={goToNextLessonAndStart}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 px-3 py-2 text-sm font-semibold">
              Следующий урок <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {hasCertification && lesson?.id === COURSE_CURRICULUM.length && (
            <button type="button" onClick={() => switchWorkspace('course')}
              className="rounded-lg bg-sky-500 text-slate-950 px-3 py-2 text-sm font-semibold">
              К карте курса
            </button>
          )}
          <button type="button" onClick={returnToTrainerSetup}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 hover:bg-slate-800 px-3 py-2 text-sm text-slate-200">
            <Settings2 className="w-4 h-4" /> К настройкам упражнения
          </button>
        </div>
      </div>
    </section>
  );
};
