import React, { Suspense } from 'react';
import type { ScoreRenderer } from '../../../core/notation/scoreRendererPreference';
import { useAppStore } from '../../../store/useAppStore';
import { TrainerBanner } from './TrainerBanner';
import { TrainerToolbar } from './TrainerToolbar';
import { GrandStaffSvg } from './GrandStaffSvg';
import { TargetInfoBar } from './TargetInfoBar';
import { PianoKeyboard } from './PianoKeyboard';
import { AttemptResultCard } from './AttemptResultCard';

// The OSMD bundle is only downloaded when its renderer is selected.
const OsmdStaff = React.lazy(() => import('./OsmdStaff').then(m => ({ default: m.OsmdStaff })));
const TwoHandPractice = React.lazy(() => import('./TwoHandPractice').then(m => ({ default: m.TwoHandPractice })));

interface TrainerWorkspaceProps {
  renderer: ScoreRenderer;
  onSelectRenderer: (renderer: ScoreRenderer) => void;
}

export const TrainerWorkspace: React.FC<TrainerWorkspaceProps> = ({ renderer, onSelectRenderer }) => {
  const { isTwoHandPracticeOpen, toggleTwoHandPractice, trainerPhase, startTrainerExercise } = useAppStore();

  // All eight training modes (including bass landmarks) now use OSMD.
  // The original Classic renderer is retained for manual visual acceptance.
  const renderOsmd = renderer === 'osmd';

  // Results replace the practice surface. No hidden keyboard can score a new
  // note until the learner explicitly chooses a next action.
  if (trainerPhase === 'results' && !isTwoHandPracticeOpen) {
    return <AttemptResultCard />;
  }

  return (
    <section className="flex-1 min-h-0 w-full flex flex-col justify-between p-2 gap-1.5 overflow-y-auto lg:overflow-hidden">
      {!isTwoHandPracticeOpen && <TrainerBanner />}
      {!isTwoHandPracticeOpen && <TrainerToolbar />}
      {!isTwoHandPracticeOpen && trainerPhase === 'setup' && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-950/30 px-3 py-2" role="status" data-testid="trainer-setup">
          <p className="text-sm text-sky-100">Настройте упражнение и начните игру. Ноты пока не оцениваются.</p>
          <button type="button" onClick={startTrainerExercise}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-sm text-slate-950 hover:bg-emerald-400">
            Начать упражнение
          </button>
        </div>
      )}
      <div className="shrink-0 flex items-center gap-2 px-1">
        <button type="button" aria-pressed={isTwoHandPracticeOpen} onClick={toggleTwoHandPractice}
          className={'rounded-lg border px-3 py-1 text-xs font-semibold ' +
            (isTwoHandPracticeOpen
              ? 'bg-sky-500/20 border-sky-400 text-sky-100'
              : 'bg-slate-900 border-slate-700 text-sky-300')}>
          {isTwoHandPracticeOpen ? 'Вернуться к тренажёру' : 'Две руки одновременно · MIDI (бета)'}
        </button>
        {isTwoHandPracticeOpen && <span className="text-xs text-amber-300">Без зачёта урока</span>}
      </div>

      {isTwoHandPracticeOpen ? (
        <Suspense fallback={<div role="status" className="flex-1 rounded-xl bg-slate-900 p-4 text-slate-300">Загрузка двухручного MIDI-практикума…</div>}>
          <TwoHandPractice />
        </Suspense>
      ) : <>
      <div className="flex-none min-h-[380px] lg:flex-1 lg:min-h-0 w-full flex flex-col justify-between overflow-hidden gap-1">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
          <div className="flex items-center gap-1" role="group" aria-label="Способ отображения нот">
            <span className="text-slate-400 mr-1">Ноты:</span>
            <button
              type="button"
              aria-pressed={renderer === 'osmd'}
              onClick={() => onSelectRenderer('osmd')}
              className={'px-2 py-1 rounded border transition ' +
                (renderer === 'osmd'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}
            >
              OSMD
            </button>
            <button
              type="button"
              aria-pressed={renderer === 'legacy'}
              onClick={() => onSelectRenderer('legacy')}
              className={'px-2 py-1 rounded border transition ' +
                (renderer === 'legacy'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}
            >
              Классический
            </button>
          </div>

        </div>

        {renderOsmd ? (
          <Suspense fallback={
            <div role="status" className="flex-1 min-h-0 grid place-content-center bg-slate-900 rounded-xl text-slate-400 text-xs">
              Подключение нотного движка…
            </div>
          }>
            <OsmdStaff onRequestLegacy={() => onSelectRenderer('legacy')} />
          </Suspense>
        ) : (
          <GrandStaffSvg />
        )}
        <TargetInfoBar />
      </div>

      <PianoKeyboard />
      </>}
    </section>
  );
};
