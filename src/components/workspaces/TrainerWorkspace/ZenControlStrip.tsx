import React, { useEffect, useRef } from 'react';
import { ArrowLeft, EyeOff, Settings, Square, Volume2, VolumeX } from 'lucide-react';
import { COURSE_CURRICULUM } from '../../../data/curriculum';
import { useAppStore } from '../../../store/useAppStore';

/**
 * The controls needed during uninterrupted practice remain reachable after
 * hiding the global header and full studio toolbar. Focus never hides the
 * technical status bar, and toggling it does not re-arm audio deadlines.
 */
export const ZenControlStrip: React.FC = () => {
  const {
    activeLessonId, activeExerciseNotes, activeNoteIndex, bpm,
    isContinuousFlow, audioEnabled, toggleAudioMaster, toggleSettingsDrawer,
    switchWorkspace, stopTrainerExercise, dismissZenForSession
  } = useAppStore();
  const exitButton = useRef<HTMLButtonElement>(null);
  const lesson = COURSE_CURRICULUM.find(item => item.id === activeLessonId);
  const played = Math.min(activeNoteIndex + 1, activeExerciseNotes.length);

  useEffect(() => {
    exitButton.current?.focus();
  }, []);

  const exitZen = () => {
    // The restored toolbar / graded control takes focus in its own mount
    // effect, AFTER React commits it. Doing it here via requestAnimationFrame
    // races with the conditional Zen-to-Studio remount.
    dismissZenForSession();
  };

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      // Modal/drawer gets first refusal. Avoid stealing Escape from an
      // interactive child, especially after opening the Settings dialog.
      if (event.key !== 'Escape' || useAppStore.getState().isSettingsOpen) return;
      event.preventDefault();
      exitZen();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  });

  return (
    <div data-testid="zen-control-strip" role="group" aria-label="Управление игрой в Zen Mode"
      className="shrink-0 w-full min-w-0 rounded-xl border border-slate-800 bg-slate-950/95 px-2 py-1.5 flex flex-wrap items-center gap-2 text-xs">
      <button type="button" className="rounded-md px-2 py-1.5 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        onClick={lesson ? () => switchWorkspace('course') : stopTrainerExercise}>
        <span className="inline-flex gap-1 items-center"><ArrowLeft className="w-3.5 h-3.5" aria-hidden="true"/>
          {lesson ? 'К курсу' : 'К настройке'}</span>
      </button>
      <span className="truncate min-w-0 max-w-40 sm:max-w-sm text-slate-300" title={lesson?.title ?? 'Свободная практика'}>
        {lesson ? `Урок ${lesson.id}` : 'Студия'} <span className="hidden sm:inline text-slate-500">· {lesson?.title ?? 'Свободная практика'}</span>
      </span>
      <span data-testid="zen-progress" className="shrink-0 font-mono tabular-nums text-slate-200"
        aria-label={`Нота ${played} из ${activeExerciseNotes.length}`}>
        {played} / {activeExerciseNotes.length}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-amber-200" data-testid="zen-tempo">{bpm} BPM</span>
      {isContinuousFlow && <span className="hidden sm:inline shrink-0 text-amber-300">Поток</span>}
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={toggleAudioMaster} title={audioEnabled ? 'Выключить звук' : 'Включить звук'}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          {audioEnabled ? <Volume2 className="w-3.5 h-3.5" aria-hidden="true"/> :
            <VolumeX className="w-3.5 h-3.5" aria-hidden="true"/>}
          <span className="sr-only">{audioEnabled ? 'Выключить звук' : 'Включить звук'}</span>
        </button>
        <button type="button" onClick={toggleSettingsDrawer} title="Открыть настройки"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          aria-haspopup="dialog" aria-label="Открыть настройки">
          <Settings className="w-3.5 h-3.5" aria-hidden="true"/>
        </button>
        <button type="button" onClick={stopTrainerExercise} data-testid="zen-stop"
          className="rounded-md px-2 py-1.5 border border-slate-700 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <span className="inline-flex items-center gap-1"><Square className="w-3 h-3" aria-hidden="true"/> Стоп</span>
        </button>
        <button type="button" ref={exitButton} onClick={exitZen} data-testid="zen-exit"
          className="rounded-md px-2 py-1.5 border border-sky-700/50 text-sky-200 hover:bg-sky-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          title="Выйти из Zen Mode (Esc)">
          <span className="inline-flex gap-1 items-center"><EyeOff className="w-3.5 h-3.5" aria-hidden="true"/> Выход</span>
        </button>
      </div>
    </div>
  );
};
