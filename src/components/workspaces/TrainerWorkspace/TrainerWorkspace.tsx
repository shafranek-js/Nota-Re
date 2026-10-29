import React, { Suspense, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { TrainerBanner } from './TrainerBanner';
import { TrainerToolbar } from './TrainerToolbar';
import { GrandStaffSvg } from './GrandStaffSvg';
import { TargetInfoBar } from './TargetInfoBar';
import { PianoKeyboard } from './PianoKeyboard';

// The OSMD bundle is only downloaded when its renderer is selected.
const OsmdStaff = React.lazy(() => import('./OsmdStaff').then(m => ({ default: m.OsmdStaff })));

type ScoreRenderer = 'osmd' | 'legacy';
const RENDERER_STORAGE_KEY = 'notare-score-renderer-v1';

function getInitialRenderer(): ScoreRenderer {
  try {
    return localStorage.getItem(RENDERER_STORAGE_KEY) === 'legacy' ? 'legacy' : 'osmd';
  } catch {
    return 'osmd';
  }
}

export const TrainerWorkspace: React.FC = () => {
  const { currentAppMode, showBassLandmarks } = useAppStore();
  const [preferredRenderer, setPreferredRenderer] = useState<ScoreRenderer>(getInitialRenderer);

  const selectRenderer = (next: ScoreRenderer) => {
    setPreferredRenderer(next);
    try { localStorage.setItem(RENDERER_STORAGE_KEY, next); } catch { /* storage optional */ }
  };

  // Interval guides now derive their anchor positions from OSMD's engraving.
  // G-pattern, Hanon and bass landmarks still need legacy overlays.
  const requiresLegacy = ['gpattern', 'hanon'].includes(currentAppMode) ||
    showBassLandmarks;
  const renderOsmd = preferredRenderer === 'osmd' && !requiresLegacy;

  return (
    <section className="flex-1 min-h-[650px] lg:min-h-0 w-full flex flex-col justify-between p-2 gap-1.5 overflow-hidden">
      <TrainerBanner />
      <TrainerToolbar />

      <div className="flex-1 min-h-0 w-full flex flex-col justify-between overflow-hidden gap-1">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
          <div className="flex items-center gap-1" role="group" aria-label="Способ отображения нот">
            <span className="text-slate-400 mr-1">Ноты:</span>
            <button
              type="button"
              aria-pressed={preferredRenderer === 'osmd'}
              onClick={() => selectRenderer('osmd')}
              className={'px-2 py-1 rounded border transition ' +
                (preferredRenderer === 'osmd'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}
            >
              OSMD
            </button>
            <button
              type="button"
              aria-pressed={preferredRenderer === 'legacy'}
              onClick={() => selectRenderer('legacy')}
              className={'px-2 py-1 rounded border transition ' +
                (preferredRenderer === 'legacy'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}
            >
              Классический
            </button>
          </div>
          {preferredRenderer === 'osmd' && requiresLegacy && (
            <span className="text-amber-300">
              Этот режим временно использует классический стан для специальных подсказок.
            </span>
          )}
        </div>

        {renderOsmd ? (
          <Suspense fallback={
            <div role="status" className="flex-1 min-h-0 grid place-content-center bg-slate-900 rounded-xl text-slate-400 text-xs">
              Подключение нотного движка…
            </div>
          }>
            <OsmdStaff onRequestLegacy={() => selectRenderer('legacy')} />
          </Suspense>
        ) : (
          <GrandStaffSvg />
        )}
        <TargetInfoBar />
      </div>

      <PianoKeyboard />
    </section>
  );
};
