import React, { Suspense } from 'react';
import type { ScoreRenderer } from '../../../core/notation/scoreRendererPreference';
import type { AppTheme } from '../../../core/ui/themePreference';
import { useAppStore } from '../../../store/useAppStore';
import { TrainerBanner } from './TrainerBanner';
import { CourseLessonControls } from './CourseLessonControls';
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
  theme: AppTheme;
}

export const TrainerWorkspace: React.FC<TrainerWorkspaceProps> = ({ renderer, onSelectRenderer, theme }) => {
  const { isTwoHandPracticeOpen, toggleTwoHandPractice, trainerPhase, openTrainerPrecheck, showVirtualKeyboard, zenModeEnabled, currentWorkspace, studioSection, activeLessonId, selectedLessonId } = useAppStore();
  const zenActive = isZenActive({ currentWorkspace, studioSection, trainerPhase, isTwoHandPracticeOpen, zenModeEnabled });

  // All eight training modes (including bass landmarks) now use OSMD.
  // The original Classic renderer is retained for manual visual acceptance.
  const renderOsmd = renderer === 'osmd';
  const courseLessonActive = trainerPhase === 'playing' && activeLessonId !== null && activeLessonId === selectedLessonId;

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
      {!zenActive && !isTwoHandPracticeOpen && (courseLessonActive
        ? <CourseLessonControls />
        : <><TrainerBanner /><TrainerToolbar renderer={renderer} onSelectRenderer={onSelectRenderer} /></>)}
      {!isTwoHandPracticeOpen && trainerPhase === 'setup' && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-950/30 px-3 py-1.5" data-testid="trainer-setup">
          <p className="text-xs text-sky-100">Упражнение готово · Ноты пока не оцениваются</p>
          <button type="button" onClick={openTrainerPrecheck}
            className="shrink-0 rounded-lg border border-sky-700/50 bg-slate-900 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
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
        {renderOsmd ? (
          <Suspense fallback={
            <div role="status" className="flex-1 min-h-0 grid place-content-center bg-slate-900 rounded-xl text-slate-400 text-xs">
              Подключение нотного движка…
            </div>
          }>
            <OsmdStaff theme={theme} zen={zenActive} onRequestLegacy={() => onSelectRenderer('legacy')} />
          </Suspense>
        ) : (
          <GrandStaffSvg theme={theme} zen={zenActive} />
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
