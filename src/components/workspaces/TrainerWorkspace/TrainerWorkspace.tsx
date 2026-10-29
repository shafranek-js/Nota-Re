import React, { Suspense } from 'react';
import type { ScoreRenderer } from '../../../core/notation/scoreRendererPreference';
import { useAppStore } from '../../../store/useAppStore';
import { TrainerBanner } from './TrainerBanner';
import { TrainerToolbar } from './TrainerToolbar';
import { GrandStaffSvg } from './GrandStaffSvg';
import { TargetInfoBar } from './TargetInfoBar';
import { PianoKeyboard } from './PianoKeyboard';
import { AttemptResultCard } from './AttemptResultCard';
import { PreplayChecklist, CountInScreen } from './PreplayChecklist';
import { ZenControlStrip } from './ZenControlStrip';
import { isZenActive } from '../../../core/training/zenMode';

// The OSMD bundle is only downloaded when its renderer is selected.
const OsmdStaff = React.lazy(() => import('./OsmdStaff').then(m => ({ default: m.OsmdStaff })));
const TwoHandPractice = React.lazy(() => import('./TwoHandPractice').then(m => ({ default: m.TwoHandPractice })));

interface TrainerWorkspaceProps {
  renderer: ScoreRenderer;
  onSelectRenderer: (renderer: ScoreRenderer) => void;
}

export const TrainerWorkspace: React.FC<TrainerWorkspaceProps> = ({ renderer, onSelectRenderer }) => {
  const { isTwoHandPracticeOpen, toggleTwoHandPractice, trainerPhase, openTrainerPrecheck, showVirtualKeyboard, zenModeEnabled, currentWorkspace } = useAppStore();
  const zenActive = isZenActive({ currentWorkspace, trainerPhase, isTwoHandPracticeOpen, zenModeEnabled });

  // All eight training modes (including bass landmarks) now use OSMD.
  // The original Classic renderer is retained for manual visual acceptance.
  const renderOsmd = renderer === 'osmd';

  // Results replace the practice surface. No hidden keyboard can score a new
  // note until the learner explicitly chooses a next action.
  if (trainerPhase === 'precheck' && !isTwoHandPracticeOpen) return <PreplayChecklist />;
  if (trainerPhase === 'countIn' && !isTwoHandPracticeOpen) return <CountInScreen />;

  if (trainerPhase === 'results' && !isTwoHandPracticeOpen) {
    return <AttemptResultCard />;
  }

  return (
    <section data-testid="studio-workspace" data-zen-active={zenActive} className={`flex-1 min-h-0 w-full flex flex-col justify-between gap-1.5 overflow-y-auto lg:overflow-hidden ${zenActive ? 'p-1 sm:p-1.5' : 'p-2'}`}>
      {zenActive && <ZenControlStrip />}
      {!zenActive && !isTwoHandPracticeOpen && <TrainerBanner />}
      {!zenActive && !isTwoHandPracticeOpen && <TrainerToolbar />}
      {!isTwoHandPracticeOpen && trainerPhase === 'setup' && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-950/30 px-3 py-2" role="status" data-testid="trainer-setup">
          <p className="text-sm text-sky-100">Настройте упражнение и нажмите «Начать упражнение» на панели. Ноты пока не оцениваются.</p>
        </div>
      )}
      {!zenActive && !isTwoHandPracticeOpen && (
        <div className="shrink-0 flex items-center px-1">
          <button type="button" onClick={openTrainerPrecheck}
            className="rounded-lg border border-sky-700/50 bg-slate-900 px-3 py-1 text-xs text-sky-300 hover:bg-sky-900/40">
            Анализ перед игрой
          </button>
        </div>
      )}
      {isTwoHandPracticeOpen && (
        <div className="shrink-0 flex items-center gap-2 px-1">
          <button type="button" onClick={toggleTwoHandPractice}
            className="rounded-lg border px-3 py-1 text-xs font-semibold bg-sky-500/20 border-sky-400 text-sky-100">
            Вернуться к тренажёру
          </button>
          <span className="text-xs text-amber-300">Без зачёта урока</span>
        </div>
      )}

      {isTwoHandPracticeOpen ? (
        <Suspense fallback={<div role="status" className="flex-1 rounded-xl bg-slate-900 p-4 text-slate-300">Загрузка двухручного MIDI-практикума…</div>}>
          <TwoHandPractice />
        </Suspense>
      ) : <>
      <div data-testid="studio-score-area" className={`w-full flex flex-col justify-between overflow-hidden gap-1 ${zenActive ? 'flex-1 min-h-[260px] sm:min-h-[320px] lg:min-h-0' : 'flex-none min-h-[380px] lg:flex-1 lg:min-h-0'}`}>
        <div className={`${zenActive ? 'hidden' : 'shrink-0 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]'}`}>
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
            <OsmdStaff zen={zenActive} onRequestLegacy={() => onSelectRenderer('legacy')} />
          </Suspense>
        ) : (
          <GrandStaffSvg zen={zenActive} />
        )}
        <TargetInfoBar zen={zenActive} />
      </div>

      <div className={showVirtualKeyboard ? 'shrink-0' : 'hidden'} aria-hidden={!showVirtualKeyboard}>
        <PianoKeyboard zen={zenActive} />
      </div>
      </>}
    </section>
  );
};
