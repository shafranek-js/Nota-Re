import React, { useEffect, useRef, useState } from 'react';
import { COURSE_CURRICULUM } from '../../../data/curriculum';
import { analyzePreplayScore } from '../../../core/training/preplayAnalysis';
import { useAppStore } from '../../../store/useAppStore';

export const PreplayChecklist: React.FC = () => {
  const { activeExerciseNotes, currentTonality, bpm, activeLessonId,
    completeTrainerPrecheck, returnToTrainerSetup } = useAppStore();
  const heading = useRef<HTMLHeadingElement>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const lesson = COURSE_CURRICULUM.find(item => item.id === activeLessonId);
  const steps = analyzePreplayScore({
    notes: activeExerciseNotes,
    tonality: currentTonality,
    bpm,
    lessonTitle: lesson?.title
  });

  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section data-testid="trainer-precheck" aria-labelledby="trainer-precheck-heading"
      className="flex-1 min-h-0 overflow-y-auto w-full p-3 sm:p-5 flex justify-center items-start">
      <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700 p-4 sm:p-6 space-y-4">
        <div>
          <p className="text-xs uppercase font-semibold tracking-wide text-sky-300">Перед игрой</p>
          <h2 id="trainer-precheck-heading" ref={heading} tabIndex={-1}
            className="text-xl font-bold text-white outline-none">Пять шагов анализа нот</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Проверьте материал глазами перед первым звуком. Можно отмечать выполненные шаги;
            это подготовка, а не оценивание и не обязательный таймер.
          </p>
        </div>
        <ol className="space-y-2">
          {steps.map(step => {
            const selected = checked.includes(step.number);
            return <li key={step.number} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 accent-emerald-500"
                  checked={selected}
                  onChange={() => setChecked(old => selected
                    ? old.filter(item => item !== step.number) : [...old, step.number])} />
                <span>
                  <span className="block font-semibold text-sm text-slate-100">
                    {step.number}. {step.title}
                  </span>
                  <span className="block text-sm text-slate-400 mt-1 leading-relaxed">{step.detail}</span>
                </span>
              </label>
            </li>;
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-400">{checked.length} из 5 отмечены · можно начать в любой момент</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={returnToTrainerSetup}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              К настройкам
            </button>
            <button type="button" onClick={completeTrainerPrecheck}
              data-testid="precheck-continue"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
              Перейти к игре
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * Minimal count-in HUD. The actual score and piano remain mounted beneath
 * it so students can examine the first notes before the downbeat.
 * No answer input is scored until the store switches to 'playing'.
 */
export const CountInScreen: React.FC = () => {
  const { countInBeat, bpm, currentAppMode, activeLessonId, cancelTrainerCountIn } = useAppStore();
  return (
    <aside data-testid="trainer-count-in" aria-label="Подготовка к игре"
      className="absolute right-2 top-2 z-30 max-w-[calc(100%-1rem)] rounded-xl border border-sky-500/50 bg-slate-950/95 px-3 py-2 shadow-lg">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
        <div className="min-w-0">
          <strong className="text-slate-100">Приготовьтесь · {bpm} BPM</strong>
          <p className="text-slate-400">
            {countInBeat === 0 ? 'Готовим нотный стан' :
              currentAppMode === 'photo'
                ? 'Фото-память: такт появится краткой вспышкой после отсчёта'
                : activeLessonId === 3
                  ? 'После «4» играйте первую ноту на следующую сильную долю!'
                  : 'Ноты уже видны · игра начнётся после 4-й доли'}
          </p>
        </div>
        <span data-testid="count-in-beat" role="status" aria-live="off"
          className="min-w-8 text-center text-2xl font-bold font-mono tabular-nums text-emerald-300">
          {countInBeat || '…'}
        </span>
        <button type="button" onClick={cancelTrainerCountIn}
          className="rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          Отменить отсчёт
        </button>
      </div>
    </aside>
  );
};
