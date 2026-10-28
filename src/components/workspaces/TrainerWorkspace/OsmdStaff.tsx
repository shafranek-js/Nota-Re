import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useAppStore } from '../../../store/useAppStore';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { createScoreFromExercise, toMusicXml } from '../../../core/notation/musicXml';
import { Volume2 } from 'lucide-react';

const speechLabels: Record<string, string> = {
  count: 'Счёт вслух (1-2-3-4)',
  tata: 'Слог: ТА-ТА-ТА-ТА',
  syllables: 'Ритмослоги Фроловой',
  solfege: 'Пение высоты (Фридкин)'
};

const collectionNames: Record<string, string> = {
  treble: '200 упр. (C4–G4)',
  treble_oct2: 'Вторая октава (C4–D5)',
  bass: 'М. Литовко (Бас C3–B3)',
  both: 'Две руки (Буква «Г»)'
};

function positionCursorAtTicks(renderer: OpenSheetMusicDisplay, onsetTicks: number): void {
  const cursor = renderer.cursor;
  const targetTime = onsetTicks / 16; // OSMD timestamps are fractions of a whole note
  cursor.reset();
  let steps = 0;
  while (!cursor.Iterator.EndReached &&
         cursor.Iterator.currentTimeStamp.RealValue + 0.000001 < targetTime &&
         steps < 512) {
    cursor.next();
    steps++;
  }
  cursor.show();
}

function currentOnsetTicks(): number {
  const { activeExerciseNotes, activeNoteIndex } = useAppStore.getState();
  return activeExerciseNotes.slice(0, activeNoteIndex)
    .reduce((sum, note) => sum + note.durMultiplier * 4, 0);
}

interface OsmdStaffProps {
  onRequestLegacy: () => void;
}

/**
 * First OSMD migration slice: a real notation renderer, driven by MusicXML.
 * It intentionally only handles modes where a standard cursor is sufficient.
 * Custom note-hiding/interval/trajectory overlays still use GrandStaffSvg.
 */
export const OsmdStaff: React.FC<OsmdStaffProps> = ({ onRequestLegacy }) => {
  const {
    activeExerciseNotes,
    activeNoteIndex,
    currentTonality,
    currentAppMode,
    currentFilter,
    speechSuppressor,
    cycleSpeechSuppressor,
    showBassLandmarks,
    toggleBassLandmarks,
    bpm
  } = useAppStore();

  const mountRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // The source array is replaced on regeneration. Progress advances the
  // active index but must NOT reload and re-engrave the score on every keypress.
  const xml = useMemo(() => {
    if (!activeExerciseNotes.length) return null;
    const score = createScoreFromExercise(activeExerciseNotes, currentTonality);
    return toMusicXml(score, { includeFingering: currentAppMode === 'hanon' });
  }, [activeExerciseNotes, currentTonality, currentAppMode]);

  useEffect(() => {
    if (!xml || !mountRef.current) return;

    let cancelled = false;
    let renderer: OpenSheetMusicDisplay | null = null;
    let observer: ResizeObserver | null = null;
    const container = mountRef.current;
    let renderWidth = container.clientWidth;
    let rendering = false;
    let needsRender = false;

    setLoadState('loading');
    setErrorMessage('');

    const runRender = async () => {
      if (rendering || cancelled || !renderer) {
        needsRender = true;
        return;
      }
      rendering = true;
      try {
        await renderer.render();
        if (!cancelled) {
          setLoadState('ready');
          osmdRef.current = renderer;
          positionCursorAtTicks(renderer, currentOnsetTicks());
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState('error');
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        rendering = false;
        if (needsRender && !cancelled) {
          needsRender = false;
          void runRender();
        }
      }
    };

    const init = async () => {
      try {
        // Load the larger engraving engine only when OSMD view is visible.
        const { OpenSheetMusicDisplay: OSMD } = await import('opensheetmusicdisplay');
        if (cancelled) return;
        renderer = new OSMD(container, {
          backend: 'svg',
          autoResize: false,
          drawingParameters: 'compacttight',
          drawTitle: false,
          drawPartNames: false,
          drawComposer: false,
          cursorsOptions: [{ type: 0, color: '#f59e0b', alpha: 0.34, follow: false }]
        });
        renderer.zoom = 0.8;
        await renderer.load(xml);
        if (cancelled) return;
        await runRender();
        if (cancelled) return;

        // Parent size changes (e.g. an opened drawer) aren't always window
        // resizes. Observe width only so OSMD height changes do not loop.
        observer = new ResizeObserver(() => {
          const width = container.clientWidth;
          if (width < 50 || Math.abs(width - renderWidth) < 3) return;
          renderWidth = width;
          void runRender();
        });
        observer.observe(container);
      } catch (error) {
        if (!cancelled) {
          setLoadState('error');
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      observer?.disconnect();
      osmdRef.current = null;
      // OSMD has no public dispose for the full instance. Explicitly release
      // cursors/backends and use autoResize:false to avoid global listeners.
      try { renderer?.cursor?.Dispose(); } catch { /* may not be initialized */ }
      try { renderer?.clear(); } catch { /* may not be rendered yet */ }
      container.replaceChildren();
    };
  }, [xml]);

  // Note: MusicXML can contain rests on the other staff. A simple cursor.next()
  // per exercise note would drift. Match the cursor's musical timestamp instead.
  const onsetTicks = activeExerciseNotes.length && activeNoteIndex < activeExerciseNotes.length
    ? activeExerciseNotes.slice(0, activeNoteIndex).reduce((sum, n) => sum + n.durMultiplier * 4, 0)
    : 0;

  useEffect(() => {
    if (loadState !== 'ready' || !osmdRef.current) return;
    try {
      positionCursorAtTicks(osmdRef.current, onsetTicks);
    } catch (error) {
      console.warn('OSMD cursor positioning failed', error);
    }
  }, [onsetTicks, loadState, xml]);

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-900/65 border border-slate-800/90 rounded-2xl relative flex flex-col p-2.5 overflow-hidden shadow-inner">
      <div className="shrink-0 w-full flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5 text-xs">
        <div className="flex items-center flex-wrap gap-2.5">
          <span className="text-slate-400">Такт: <strong className="text-white">{Math.floor(onsetTicks / 16) + 1}</strong></span>
          <span className="text-slate-400">Сборник: <strong className="text-sky-400">{collectionNames[currentFilter]}</strong></span>
          <span className="text-emerald-300">OSMD · MusicXML</span>
        </div>
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            onClick={toggleBassLandmarks}
            title="Включить ориентиры басового ключа (временно использует классический стан)"
            className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-md text-purple-300"
          >
            𝄢 Маяки баса: {showBassLandmarks ? 'ВКЛ' : 'ВЫКЛ'}
          </button>
          <button
            onClick={() => audioEngine.playSyllablePatternDemo('titi', bpm)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-amber-300"
          >
            <Volume2 className="w-3 h-3" /> Ритм-образец
          </button>
          <button
            onClick={cycleSpeechSuppressor}
            className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-amber-300"
            title="Сменить режим речевого сопровождения"
          >
            Речь: {speechLabels[speechSuppressor]}
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-auto mt-2 rounded-lg bg-white text-slate-900">
        <div ref={mountRef} className="w-full min-h-[200px]" aria-label="Нотная партитура OpenSheetMusicDisplay" />
        {loadState === 'loading' && (
          <div role="status" className="absolute inset-0 flex items-center justify-center bg-white/95 text-slate-600 text-xs">
            Загрузка нотного стана…
          </div>
        )}
        {loadState === 'error' && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-red-700 text-xs px-4 text-center">
            <span>Ошибка нотного движка: {errorMessage}</span>
            <button onClick={onRequestLegacy} className="px-3 py-1 rounded bg-slate-900 text-white">
              Вернуться к прежнему нотному стану
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
