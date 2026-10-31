import React, { useMemo, useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { TriadFigure } from '../../core/notation/intervalGuides.ts';
import {
  createModuleVInversionFixture, evaluateModuleVInversion, MODULE_V_INVERSION_COUNT
} from '../../core/training/moduleVInversions.ts';
import {
  loadModuleVInversions, recordModuleVInversion, type InversionPracticeMode
} from '../../core/storage/moduleVInversionStorage.ts';
import { ModuleVInversionScore } from './ModuleVInversionScore.tsx';

const ANSWERS: readonly { readonly value: TriadFigure; readonly id: string; readonly name: string }[] = [
  { value: '5/3', id: 'root', name: '5/3 · Основной вид' },
  { value: '6', id: 'first', name: '6 · Первое обращение' },
  { value: '6/4', id: 'second', name: '6/4 · Второе обращение' }
];

export const ModuleVInversionPractice: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<InversionPracticeMode>('guided');
  const [response, setResponse] = useState<TriadFigure | null>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [practice, setPractice] = useState(loadModuleVInversions);
  const fixture = useMemo(() => createModuleVInversionFixture(index), [index]);
  const feedback = useMemo(
    () => response === null ? null : evaluateModuleVInversion(fixture, response),
    [fixture, response]
  );

  const clearAnswer = () => {
    setResponse(null);
    setShowMethod(false);
    setShowSolution(false);
  };
  const next = () => {
    clearAnswer();
    setIndex(previous => (previous + 1) % MODULE_V_INVERSION_COUNT);
  };
  const switchMode = (selected: InversionPracticeMode) => {
    if (selected === mode) return;
    setMode(selected);
    clearAnswer();
    // Independent recognition starts with a fresh score, not a score just
    // revealed by guided explanation.
    setIndex(previous => (previous + 1) % MODULE_V_INVERSION_COUNT);
  };
  const answer = (choice: TriadFigure) => {
    if (response !== null) return;
    const outcome = evaluateModuleVInversion(fixture, choice);
    setResponse(choice);
    setPractice(recordModuleVInversion({
      fixtureId: fixture.id, mode, response: choice,
      correct: outcome.correct, usedHint: mode === 'guided' && showSolution
    }));
  };
  const revealed = feedback !== null || (mode === 'guided' && showSolution);
  const guide = revealed ? fixture.guide : null;

  return (
    <div data-testid="module-v-v2-practice" className="min-w-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-mono text-sky-300">V2 · module-v/v1/inversions</p>
          <h2 className="text-base font-semibold text-slate-100 mt-1">Узнайте обращение по нотам</h2>
          <p className="text-xs text-slate-400 mt-1">
            Пример {index + 1} из {MODULE_V_INVERSION_COUNT} ·
            {' '}Ответов в учебном журнале: {practice.attempts.length}
          </p>
        </div>
        <span className="text-[11px] text-amber-300">Без зачёта уроков 1–12</span>
      </div>

      <div role="group" aria-label="Режим чтения аккордов"
        className="flex flex-wrap gap-2" data-testid="module-v-v2-modes">
        <button type="button" data-testid="module-v-v2-guided"
          aria-pressed={mode === 'guided'} onClick={() => switchMode('guided')}
          className={`rounded-lg border px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${mode === 'guided'
            ? 'border-sky-500 bg-sky-900/40 text-white' : 'border-slate-700 text-slate-300'}`}>
          Обучение с подсказками
        </button>
        <button type="button" data-testid="module-v-v2-independent"
          aria-pressed={mode === 'independent'} onClick={() => switchMode('independent')}
          className={`rounded-lg border px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${mode === 'independent'
            ? 'border-sky-500 bg-sky-900/40 text-white' : 'border-slate-700 text-slate-300'}`}>
          Самостоятельное распознавание
        </button>
      </div>

      <p className="text-xs text-slate-300">
        Прочитайте три одновременно записанные ноты. Какая нота внизу?
        Какое обращение трезвучия перед вами?
      </p>
      <ModuleVInversionScore score={fixture.score} />

      {mode === 'guided' && feedback === null && (
        <div className="rounded-lg border border-slate-700 p-2.5 text-xs text-slate-300">
          <button type="button" data-testid="module-v-v2-method"
            aria-expanded={showMethod} onClick={() => setShowMethod(value => !value)}
            className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
            {showMethod ? 'Скрыть метод определения' : 'Как определить обращение?'}
          </button>
          {showMethod && (
            <p className="mt-2" data-testid="module-v-v2-method-content">
              Определите звуки через терции и найдите основной тон трезвучия.
              Если в басу основной тон — 5/3, терция — 6, квинта — 6/4.
              Ориентируйтесь на реальные ноты, а не на порядок кнопок.
            </p>
          )}
          {!showSolution && (
            <button type="button" data-testid="module-v-v2-reveal"
              onClick={() => setShowSolution(true)}
              className="block mt-2 text-amber-200 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
              Показать разбор (ответ будет подсказан)
            </button>
          )}
        </div>
      )}

      <fieldset data-testid="module-v-v2-options" disabled={response !== null}
        className="min-w-0">
        <legend className="text-xs font-semibold text-slate-200 mb-2">Ваш ответ</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ANSWERS.map(option => (
            <button key={option.value} type="button"
              data-testid={`module-v-v2-answer-${option.id}`}
              disabled={response !== null} onClick={() => answer(option.value)}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-xs text-slate-100 hover:bg-slate-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
              {option.name}
            </button>
          ))}
        </div>
      </fieldset>

      {guide && (
        <div data-testid="module-v-v2-feedback"
          role="status" aria-live="polite"
          className="rounded-lg border border-sky-700/40 bg-sky-950/30 p-3 text-xs text-slate-200 space-y-1.5">
          {feedback ? <strong className="block">{feedback.correct ? 'Верно.' : 'Пока неверно.'}</strong>
            : <strong className="block">Разбор с подсказкой · не самостоятельный ответ.</strong>}
          <p>Правильный ответ: <strong>{guide.figure}</strong>.
            {' '}{guide.quality === 'major' ? 'Мажорное' : 'Минорное'} трезвучие от {guide.tonic}.</p>
          <p>Бас: <strong>{guide.bass}</strong>. {guide.explanation}</p>
          {feedback && mode === 'guided' && showSolution && (
            <p>Ответ выполнен после просмотра решения; он записан как учебная попытка с подсказкой.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <button type="button" data-testid="module-v-v2-retry"
          onClick={clearAnswer}
          className="inline-flex gap-1.5 items-center rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Повторить тот же пример
        </button>
        <button type="button" data-testid="module-v-v2-next"
          onClick={next}
          className="inline-flex gap-1.5 items-center rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          Следующий пример <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">
        Результаты V2 — только учебные попытки. Они не влияют на оценки, прогресс курса,
        метроном, MIDI-проверку и результаты V1.
      </p>
    </div>
  );
};
