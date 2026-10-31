import React, { Suspense, useEffect } from 'react';
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
  const { isTwoHandPracticeOpen, toggleTwoHandPractice, trainerPhase, showVirtualKeyboard, zenModeEnabled, zenSessionStarted, zenDismissedForSession, currentWorkspace, studioSection, activeLessonId, selectedLessonId, beginVisibleCountIn } = useAppStore();
  const zenActive = isZenActive({ currentWorkspace, studioSection, trainerPhase, isTwoHandPracticeOpen, zenModeEnabled, zenSessionStarted, zenDismissedForSession });

  // All eight training modes (including bass landmarks) now use OSMD.
  // The original Classic renderer is retained for manual visual acceptance.
  const renderOsmd = renderer === 'osmd';
  const countIn = trainerPhase === 'countIn' && !isTwoHandPracticeOpen;
  const courseLessonActive = (trainerPhase === 'playing' || countIn) &&
    activeLessonId !== null && activeLessonId === selectedLessonId;

  // Classic SVG is synchronous, OSMD reports its actual completed engraving.
  // Both start the same store-owned audio-clock only after a visible score.
  useEffect(() => {
    if (!countIn || renderOsmd) return;
    const frame = window.requestAnimationFrame(() => beginVisibleCountIn());
    return () => window.cancelAnimationFrame(frame);
  }, [countIn, renderOsmd, beginVisibleCountIn]);

  // Results replace the practice surface. No hidden keyboard can score a new
  // note until the learner explicitly chooses a next action.
  if (trainerPhase === 'precheck' && !isTwoHandPracticeOpen) return <PreplayChecklist />;

  if (trainerPhase === 'results' && !isTwoHandPracticeOpen) {
    return <AttemptResultCard />;
  }

  return (
    <section data-testid="studio-workspace" data-zen-active={zenActive} className={`relative flex-1 min-h-0 w-full flex flex-col justify-between gap-1.5 overflow-y-auto lg:overflow-hidden ${zenActive ? 'p-1 sm:p-1.5' : 'p-2'}`}>
      {zenActive && <div className="shrink-0" inert={countIn}><ZenControlStrip /></div>}
      {!zenActive && !isTwoHandPracticeOpen && (
        <div className="shrink-0" inert={countIn}>
          {courseLessonActive
            ? <CourseLessonControls />
            : <><TrainerBanner /><TrainerToolbar renderer={renderer} onSelectRenderer={onSelectRenderer} /></>}
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
      <div data-testid="studio-score-area" className={`relative w-full flex flex-col justify-between overflow-hidden gap-1 ${zenActive ? 'flex-1 min-h-[260px] sm:min-h-[320px] lg:min-h-0' : 'flex-none min-h-[380px] lg:flex-1 lg:min-h-0'}`}>
        {countIn && <CountInScreen />}
        {renderOsmd ? (
          <Suspense fallback={
            <div role="status" className="flex-1 min-h-0 grid place-content-center bg-slate-900 rounded-xl text-slate-400 text-xs">
              Подключение нотного движка…
            </div>
          }>
            <OsmdStaff theme={theme} zen={zenActive} onScoreReady={beginVisibleCountIn}
              onRequestLegacy={() => onSelectRenderer('legacy')} />
          </Suspense>
        ) : (
          <GrandStaffSvg theme={theme} zen={zenActive} />
        )}
        <TargetInfoBar zen={zenActive} />
      </div>

      <div className={showVirtualKeyboard ? 'shrink-0' : 'hidden'}
        inert={countIn} aria-hidden={!showVirtualKeyboard || countIn}>
        <PianoKeyboard zen={zenActive} />
      </div>
      </>}
    </section>
  );
};
