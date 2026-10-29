import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useAppStore } from '../../../store/useAppStore';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { createScoreFromExercise, toMusicXml } from '../../../core/notation/musicXml';
import { getMaskedNoteIndices, getNoteOnsets, TICKS_PER_MEASURE } from '../../../core/notation/scoreMasks';
import { getIntervalGuides } from '../../../core/notation/intervalGuides';
import { Volume2, Camera } from 'lucide-react';

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
 * MusicXML-based notation with optional pedagogical note hiding. Notehead/stem
 * visibility is applied to OSMD's own graphical notes; no custom staff layout.
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
    bpm,
    isPhotoMasked,
    triggerPhotoFlash
  } = useAppStore();

  const mountRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [renderEpoch, setRenderEpoch] = useState(0);
  const hiddenNotesRef = useRef<Set<SVGElement>>(new Set());

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
          setRenderEpoch(epoch => epoch + 1);
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
      for (const element of hiddenNotesRef.current) {
        element.style.visibility = '';
        element.removeAttribute('data-notare-masked');
      }
      hiddenNotesRef.current.clear();
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
  const noteOnsets = useMemo(() => getNoteOnsets(activeExerciseNotes), [activeExerciseNotes]);
  const onsetTicks = noteOnsets[activeNoteIndex] ?? 0;
  const actualBar = Math.floor(onsetTicks / TICKS_PER_MEASURE) + 1;

  useEffect(() => {
    if (loadState !== 'ready' || !osmdRef.current) return;
    try {
      positionCursorAtTicks(osmdRef.current, onsetTicks);
    } catch (error) {
      console.warn('OSMD cursor positioning failed', error);
    }
  }, [onsetTicks, loadState, xml]);

  // Apply visual teaching masks to OSMD-generated note SVG groups. We do not
  // draw or position notes ourselves, and we keep score/key/staff geometry intact.
  // Also include split tied-note segments when a note crosses a barline.
  useEffect(() => {
    for (const element of hiddenNotesRef.current) {
      element.style.visibility = '';
      element.removeAttribute('data-notare-masked');
    }
    hiddenNotesRef.current.clear();

    const renderer = osmdRef.current;
    if (!renderer || loadState !== 'ready') return;
    const indices = getMaskedNoteIndices(
      activeExerciseNotes,
      activeNoteIndex,
      currentAppMode === 'lookahead' || currentAppMode === 'photo' ? currentAppMode : 'none',
      isPhotoMasked
    );
    if (indices.length === 0) return;

    try {
      const positions = new Set<number>();
      for (const index of indices) {
        const start = noteOnsets[index];
        const end = start + activeExerciseNotes[index].durMultiplier * 4;
        positions.add(start);
        for (let barline = Math.floor(start / TICKS_PER_MEASURE + 1) * TICKS_PER_MEASURE;
             barline < end;
             barline += TICKS_PER_MEASURE) {
          positions.add(barline);
        }
      }

      for (const ticks of [...positions].sort((a, b) => a - b)) {
        positionCursorAtTicks(renderer, ticks);
        for (const graphicalNote of renderer.cursor.GNotesUnderCursor()) {
          // getSVGGElement is implemented by OSMD's VexFlowGraphicalNote,
          // but not declared on the abstract GraphicalNote base type.
          const vexflowNote = graphicalNote as typeof graphicalNote & {
            getSVGGElement?: () => SVGElement | undefined;
          };
          const element = vexflowNote.getSVGGElement?.();
          if (!element) continue;
          element.style.visibility = 'hidden';
          element.setAttribute('data-notare-masked', 'true');
          hiddenNotesRef.current.add(element);
        }
      }
    } catch (error) {
      console.error('OSMD teaching mask failed', error);
      setLoadState('error'); // Never silently show unmasked memory exercises.
      setErrorMessage('Не удалось скрыть ноты. Используйте классический стан.');
    } finally {
      // Mask inspection walks the iterator: always restore actual training spot.
      positionCursorAtTicks(renderer, currentOnsetTicks());
    }
  }, [activeExerciseNotes, activeNoteIndex, currentAppMode, isPhotoMasked, loadState, noteOnsets, renderEpoch]);

  // Teaching overlay only: derive interval arcs from OSMD's rendered note
  // positions, never reimplement the notation/staff layout. OSMD can create
  // multiple SVG pages, so connect only notes in the same SVG viewport.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.querySelectorAll('[data-notare-interval-overlay="true"]').forEach(el => el.remove());
    if (loadState !== 'ready' || currentAppMode !== 'intervals' || !osmdRef.current) return;

    const renderer = osmdRef.current;
    const guides = getIntervalGuides(activeExerciseNotes);
    if (!guides.length) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    type Point = { x: number; y: number; root: SVGSVGElement };
    const points = new Map<number, Point>();

    try {
      for (const index of new Set(guides.flatMap(g => [g.fromIndex, g.toIndex]))) {
        positionCursorAtTicks(renderer, noteOnsets[index]);
        for (const graphicalNote of renderer.cursor.GNotesUnderCursor()) {
          const vexflowNote = graphicalNote as typeof graphicalNote & {
            getSVGGElement?: () => SVGElement | undefined;
          };
          const element = vexflowNote.getSVGGElement?.();
          if (!element || !mount.contains(element)) continue;
          const root = element.closest('svg') as SVGSVGElement | null;
          if (!root) continue;
          // VexFlow notehead groups are preferable to the complete note
          // bounding box, which can include the stem, ledger and flags.
          const head = element.querySelector<SVGGraphicsElement>(
            '.vf-notehead, [class*="notehead"], [id*="notehead"]'
          ) ?? element;
          const rect = head.getBoundingClientRect();
          const matrix = root.getScreenCTM();
          if (!matrix || rect.width < 1 || rect.height < 1) continue;
          const point = root.createSVGPoint();
          point.x = rect.left + rect.width / 2;
          point.y = rect.top + rect.height / 2;
          const local = point.matrixTransform(matrix.inverse());
          points.set(index, { x: local.x, y: local.y, root });
          break;
        }
      }

      for (const guide of guides) {
        const from = points.get(guide.fromIndex);
        const to = points.get(guide.toIndex);
        if (!from || !to || from.root !== to.root) continue;
        const root = from.root;
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('data-notare-interval-overlay', 'true');
        group.setAttribute('aria-hidden', 'true');
        group.setAttribute('pointer-events', 'none');
        const xMid = (from.x + to.x) / 2;
        const yTop = Math.min(from.y, to.y) - 20;
        const arc = document.createElementNS(svgNS, 'path');
        arc.setAttribute('d',
          `M ${from.x} ${from.y - 10} Q ${xMid} ${yTop - 18} ${to.x} ${to.y - 10}`);
        arc.setAttribute('fill', 'none');
        arc.setAttribute('stroke', guide.symmetric ? '#4f46e5' : '#047857');
        arc.setAttribute('stroke-width', '1.8');
        if (!guide.symmetric) arc.setAttribute('stroke-dasharray', '4 3');

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', String(xMid));
        label.setAttribute('y', String(yTop - 7));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11');
        label.setAttribute('fill', guide.symmetric ? '#3730a3' : '#065f46');
        label.textContent = `${guide.steps}-я`;
        group.append(arc, label);
        root.appendChild(group);
      }
      if (!mount.querySelector('[data-notare-interval-overlay="true"]')) {
        // If actual note geometry cannot be found, do not silently lose
        // the pedagogical interval guides when switching from Classic.
        setErrorMessage('Не удалось разместить интервальные подсказки. Используйте классический стан.');
        setLoadState('error');
      }
    } catch (error) {
      console.error('OSMD interval guides failed', error);
      setErrorMessage('Не удалось разместить интервальные подсказки. Используйте классический стан.');
      setLoadState('error');
    } finally {
      positionCursorAtTicks(renderer, currentOnsetTicks());
    }

    return () => {
      mount.querySelectorAll('[data-notare-interval-overlay="true"]').forEach(el => el.remove());
    };
  }, [activeExerciseNotes, noteOnsets, currentAppMode, loadState, renderEpoch]);

  return (
    <div data-testid="osmd-score" data-active-note-index={activeNoteIndex} className="flex-1 min-h-0 w-full bg-slate-900/65 border border-slate-800/90 rounded-2xl relative flex flex-col p-2.5 overflow-hidden shadow-inner">
      <div className="shrink-0 w-full flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5 text-xs">
        <div className="flex items-center flex-wrap gap-2.5">
          <span className="text-slate-400">Такт: <strong className="text-white">{actualBar}</strong></span>
          <span className="text-slate-400">Сборник: <strong className="text-sky-400">{collectionNames[currentFilter]}</strong></span>
          <span className="text-emerald-300">OSMD · MusicXML</span>
        </div>
        <div className="flex items-center flex-wrap gap-1.5">
          {currentAppMode === 'photo' && (
            <button
              onClick={triggerPhotoFlash}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
              title="Показать ноты текущего такта на выбранное время"
            >
              <Camera className="w-3 h-3" />
              Вспышка такта
            </button>
          )}
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
        {currentAppMode === 'photo' && isPhotoMasked && (
          <div data-testid="photo-masked-notice" className="sticky top-0 z-20 mx-auto w-fit px-3 py-1 rounded-b-lg bg-cyan-950 text-cyan-100 text-xs pointer-events-none">
            Такт {actualBar} скрыт — играйте по памяти
          </div>
        )}
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
