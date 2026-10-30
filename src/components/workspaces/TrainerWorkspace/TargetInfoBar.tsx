import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { computeIntervalInfo } from '../../../core/generator/ExerciseGenerator';
import { countRhythmOutcomes, lessonThreeOnsetToleranceMs } from '../../../core/training/lessonThreeRhythm';

export const TargetInfoBar: React.FC<{ zen?: boolean }> = ({ zen = false }) => {
  const {
    activeExerciseNotes,
    activeNoteIndex,
    lastTriggeredNote,
    currentAppMode,
    isPhotoMasked,
    isExerciseAssisted,
    activeLessonId,
    trainerPhase,
    isContinuousFlow,
    attemptEvents,
    bpm
  } = useAppStore();

  const target = activeExerciseNotes[activeNoteIndex];
  const prevNote = activeNoteIndex > 0 ? activeExerciseNotes[activeNoteIndex - 1] : null;
  const intervalInfo = computeIntervalInfo(prevNote, target);
  // Photo-memory hides the active measure on both OSMD and classic staves.
  // Text hints must not reveal the same pitches, fingering or rhythms during
  // the masked interval (including to assistive technology).
  const hidePhotoHints = currentAppMode === 'photo' && isPhotoMasked;
  const showRhythmFeedback = activeLessonId === 3 && isContinuousFlow &&
    (trainerPhase === 'playing' || trainerPhase === 'countIn');
  const rhythm = showRhythmFeedback ? countRhythmOutcomes(attemptEvents) : null;
  const onsetWindow = target ? lessonThreeOnsetToleranceMs(target, bpm) : 0;
  const rhythmFeedback = showRhythmFeedback && rhythm && (
    <div data-testid="lesson-three-rhythm-feedback" aria-live="off"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
      <strong className="text-emerald-300">Верно: {rhythm.correct}</strong>
      <span className="text-rose-300">Не та нота: {rhythm.wrongPitch}</span>
      <span className="text-amber-300">Поздно: {rhythm.late}</span>
      <span className="text-slate-300">Пропуски: {rhythm.missed}</span>
      <span data-testid="lesson-three-onset-window" className="text-sky-300"
        title="Допуск измеряется от начала каждой ноты; не от её окончания.">
        Время вступления: первые {onsetWindow} мс ноты
      </span>
    </div>
  );

  const tips: Record<string, string> = {
    reflex: 'Вижу знак на линейке ➔ палец сразу жмёт клавишу. Запретите себе называть ноту в уме!',
    rhythm: 'Произносите вслух ритмослоги: «ТА», «ТИ-ТИ», «ТИ-РИ-ТИ-РИ». Счёт «раз-и-два-и» запрещён!',
    lookahead: 'Глаза на 1 шаг впереди рук! Смотрите в следующую ноту ещё до того, как палец отпустит текущую.',
    photo: 'Схватите 4 ноты такта одним зрительным снимком до появления маски. Играйте по памяти!',
    intervals: 'Считывайте дистанцию: одинаковые линейки — через палец, линия в окошко — соседний палец.',
    gpattern: 'Траектория буквы «Г»: бас на 1-ю долю (левая рука) ➔ глаза скользят вверх и вправо по мелодии.',
    blind: 'Не смотрите на клавиатуру! Ощупывайте рельеф по островкам из 2 и 3 чёрных клавиш.',
    hanon: 'Чёткий посыл в кончики 4-го и 5-го пальцев. Совмещайте стаккато в левой руке с легато в правой!'
  };

  // Focus mode shows only cues needed for the selected teaching mode.
  // Never disclose masked photo pitches, and never announce a new note on
  // every key strike via an intrusive live region.
  if (zen) {
    const prompt = currentAppMode === 'rhythm'
      ? `Ритмослог: ${target?.syllable || 'ТА'}`
      : currentAppMode === 'intervals'
        ? `Интервал: ${intervalInfo.name}`
        : currentAppMode === 'hanon'
          ? `Палец / штрих: ${target?.finger || 1} · ${target?.articulation || 'legato'}`
          : currentAppMode === 'photo'
            ? hidePhotoHints ? 'Играйте такт по памяти' : 'Смотрите на такт до появления маски'
            : currentAppMode === 'lookahead'
              ? 'Смотрите на следующую ноту'
              : currentAppMode === 'gpattern'
                ? 'Следите за траекторией между двумя станами'
                : currentAppMode === 'blind'
                  ? 'Ориентируйтесь по группам чёрных клавиш'
                  : 'Читайте с нотного стана';
    return (
      <div data-testid="zen-coaching" aria-live="off"
        className="shrink-0 w-full min-h-6 text-xs text-slate-400 px-2 flex items-center gap-2">
        {isExerciseAssisted && <strong className="text-amber-300">Без зачёта: подсказка</strong>}
        <span>{prompt}</span>
        {rhythmFeedback}
      </div>
    );
  }

  return (
    <div className="shrink-0 w-full min-w-0 border-t border-slate-800/60 pt-1 text-xs">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap custom-scroll pb-0.5">
        {isExerciseAssisted && (
          <span role="status" data-testid="assisted-step-notice"
            className="shrink-0 rounded border border-amber-500/50 px-1.5 py-0.5 text-amber-300">
            Подсказка использована — без зачёта
          </span>
        )}
        <span className="shrink-0 text-slate-400">
          Цель: <strong data-testid="active-target-note" className="text-sky-400 font-mono">{hidePhotoHints ? 'По памяти' : target?.noteName || '—'}</strong>
        </span>
        <span className="shrink-0 border-l border-slate-800 pl-1.5 text-slate-400">
          Интервал: <strong data-testid="active-target-interval" className="text-indigo-400 font-mono">{hidePhotoHints ? 'Скрыт' : intervalInfo.name}</strong>
        </span>
        <span className="shrink-0 border-l border-slate-800 pl-1.5 text-slate-400">
          Ритм: <strong data-testid="active-target-syllable" className="text-amber-400 font-mono">{hidePhotoHints ? 'Скрыт' : target?.syllable || 'ТА'}</strong>
        </span>
        <span className="shrink-0 border-l border-slate-800 pl-1.5 text-slate-400">
          Палец / штрих: <strong data-testid="active-target-fingering" className="text-rose-400 font-mono">{hidePhotoHints ? 'Скрыт' : `${target?.finger || 1} • ${target?.articulation || 'legato'}`}</strong>
        </span>
        <span className="shrink-0 border-l border-slate-800 pl-1.5 text-slate-400">
          Ответ: <strong data-testid="last-played-note" className="text-slate-300 font-mono">{lastTriggeredNote || '—'}</strong>
        </span>
        <details className="relative shrink-0 border-l border-slate-800 pl-1.5 text-slate-400">
          <summary className="cursor-pointer text-emerald-300 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            Методика
          </summary>
          <span className="block max-w-[min(78vw,32rem)] whitespace-normal py-1 text-slate-300">
            {tips[currentAppMode] || tips.reflex}
          </span>
        </details>
      </div>
      {showRhythmFeedback && <p className="text-[11px] text-sky-300">
        После отсчёта 1–2–3–4 вступайте на следующую сильную долю. Не останавливайтесь при ошибке: пропуск или позднее вступление снижают точность.
      </p>}
      {rhythmFeedback}
    </div>
  );
};
