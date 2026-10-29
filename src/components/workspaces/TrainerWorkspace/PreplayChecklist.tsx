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

/** Actual count-in phase: score, piano and grading controls are not mounted. */
export const CountInScreen: React.FC = () => {
  const { countInBeat, bpm, cancelTrainerCountIn } = useAppStore();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section data-testid="trainer-count-in" aria-labelledby="count-in-heading"
      className="flex-1 min-h-0 flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8 text-center space-y-4">
        <h2 id="count-in-heading" ref={heading} tabIndex={-1}
          className="text-xl font-bold text-white outline-none">Приготовьтесь к игре</h2>
        <p className="text-sm text-slate-300">Четыре доли подготовки · {bpm} BPM</p>
        <div role="status" aria-live="off" data-testid="count-in-beat"
          className="text-6xl font-mono font-bold tabular-nums text-emerald-300">
          {countInBeat || '—'}
        </div>
        <p className="text-sm text-slate-400">После отсчёта начнётся ритмическая практика</p>
        <button type="button" onClick={cancelTrainerCountIn}
          className="px-4 py-2 border border-slate-600 hover:bg-slate-800 rounded-lg text-sm text-slate-200">
          Отменить отсчёт
        </button>
      </div>
    </section>
  );
};
