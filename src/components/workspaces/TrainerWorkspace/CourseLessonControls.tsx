import React from 'react';
import { ArrowLeft, FileDown, Pause, Play, Settings2, Square } from 'lucide-react';
import { COURSE_CURRICULUM } from '../../../data/curriculum';
import { downloadExerciseMusicXml } from '../../../core/notation/downloadMusicXml';
import { useAppStore } from '../../../store/useAppStore';

/**
 * Active certified lessons do not expose the free-practice parameter picker.
 * Changing tempo, mode, rhythm or material requires an explicit transition
 * into ungraded setup, using the existing stop action and its timer cleanup.
 */
export const CourseLessonControls: React.FC = () => {
  const {
    activeLessonId, selectedLessonId, activeExerciseNotes, currentTonality,
    currentAppMode, bpm, isContinuousFlow, completedExercisesCount,
    zenSessionStarted, zenDismissedForSession, openTrainerPrecheck, stopTrainerExercise,
    toggleContinuousFlow, switchWorkspace
  } = useAppStore();
  const lesson = COURSE_CURRICULUM.find(item =>
    item.id === activeLessonId && item.id === selectedLessonId
  );

  React.useLayoutEffect(() => {
    if (zenSessionStarted && zenDismissedForSession) {
      document.querySelector<HTMLButtonElement>('[data-testid="course-focused-controls"] button')?.focus();
    }
    // Focus only on mount, after Zen has unmounted and Course controls exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!lesson) return null;

  const exportScore = () => {
    try {
      downloadExerciseMusicXml(activeExerciseNotes, currentTonality, currentAppMode);
    } catch (error) {
      console.error('MusicXML export failed', error);
      window.alert('Не удалось экспортировать упражнение в MusicXML.');
    }
  };

  return (
    <div data-testid="course-focused-controls"
      role="group" aria-label="Управление зачётным уроком"
      className="shrink-0 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-3 py-2 text-xs">
      <button type="button" onClick={() => switchWorkspace('course')}
        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        <span className="inline-flex items-center gap-1"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> К курсу</span>
      </button>
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <strong className="text-emerald-200">Урок {lesson.id} / 12</strong>
          <span data-testid="course-credit-mode" className="font-semibold text-emerald-300">
            Зачётная попытка
          </span>
          <span className="text-slate-400">{completedExercisesCount} / {lesson.normReps} ном.</span>
        </div>
        <p className="truncate text-slate-200" title={lesson.title}>{lesson.title} · {bpm} BPM
          {lesson.id === 10 && (
            <span data-testid="lesson-ten-stage" className="ml-2 text-sky-300">
              · Этап {currentAppMode === 'photo' ? '2: Фото-память (8)' : '1: Бегунок (7)'}
            </span>
          )}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {isContinuousFlow && (
          <button type="button" onClick={toggleContinuousFlow}
            title="Пауза потока завершает зачётную попытку и переводит в свободную практику"
            className="rounded-lg border border-amber-500/40 px-2.5 py-1.5 text-amber-200 hover:bg-amber-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            <span className="inline-flex items-center gap-1">
              {isContinuousFlow ? <Pause aria-hidden="true" className="h-3 w-3" /> :
                <Play aria-hidden="true" className="h-3 w-3" />}
              Поток: ИДЁТ
            </span>
          </button>
        )}
        <button type="button" onClick={openTrainerPrecheck}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sky-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          Анализ перед игрой
        </button>
        <button type="button" onClick={exportScore}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <span className="inline-flex items-center gap-1"><FileDown aria-hidden="true" className="h-3.5 w-3.5" /> MusicXML</span>
        </button>
        <button type="button" onClick={stopTrainerExercise}
          data-testid="course-to-free-setup"
          title="Остановить зачёт и открыть свободные настройки упражнения"
          className="rounded-lg border border-sky-600/50 px-2.5 py-1.5 text-sky-200 hover:bg-sky-900/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <span className="inline-flex items-center gap-1"><Settings2 aria-hidden="true" className="h-3.5 w-3.5" /> Настроить свободную практику</span>
        </button>
        <button type="button" onClick={stopTrainerExercise}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <span className="inline-flex items-center gap-1"><Square aria-hidden="true" className="h-3 w-3" /> Остановить</span>
        </button>
      </div>
    </div>
  );
};
