import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useAppStore } from '../../../store/useAppStore';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { createScoreFromExercise, toMusicXml } from '../../../core/notation/musicXml';
import { getMaskedNoteIndices, getNoteOnsets, TICKS_PER_MEASURE } from '../../../core/notation/scoreMasks';
import { getIntervalGuides } from '../../../core/notation/intervalGuides';
import { getGazeGuides } from '../../../core/notation/gazeGuides';
import { getHanonBlocks } from '../../../core/notation/hanonBlocks';
import { getBassLandmarkSegments } from '../../../core/notation/bassLandmarks';
import { getExerciseEngravingKey } from '../../../core/notation/exerciseEngravingKey';
import { osmdZoomForWidth } from '../../../core/notation/osmdZoom';
import { getEngravedNotePoint, positionCursorAtTicks, getBassStaveGeometries, getTrebleStaveGeometries, type EngravedPoint } from '../../../core/notation/osmdGeometryAdapter';
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

function positionTeachingCursor(renderer: OpenSheetMusicDisplay, ticks: number): void {
  positionCursorAtTicks(renderer, ticks);
  // Keep the OSMD iterator for masks and teaching geometry, but hide the
  // default paper-style vertical rectangle. Nota-Re highlights actual notes.
  renderer.cursor.hide();
}

function styleClefs(mount: HTMLElement): void {
  // VexFlow emits treble and bass clefs in score order for every piano system.
  mount.querySelectorAll<SVGGElement>('.vf-clef').forEach((clef, index) => {
    const color = index % 2 === 0 ? '#38bdf8' : '#a855f7';
    clef.querySelectorAll<SVGElement>('path').forEach(path => {
      path.style.fill = color;
      path.style.stroke = color;
    });
  });
}

function currentOnsetTicks(): number {
  const { activeExerciseNotes, activeNoteIndex } = useAppStore.getState();
  return activeExerciseNotes.slice(0, activeNoteIndex)
    .reduce((sum, note) => sum + note.durMultiplier * 4, 0);
}

interface OsmdStaffProps {
  onRequestLegacy: () => void;
  zen?: boolean;
}

/**
 * MusicXML-based notation with optional pedagogical note hiding. Notehead/stem
 * visibility is applied to OSMD's own graphical notes; no custom staff layout.
 */
export const OsmdStaff: React.FC<OsmdStaffProps> = ({ onRequestLegacy, zen = false }) => {
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
  const zenRef = useRef(zen);
  zenRef.current = zen;
  const requestEngravingRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [renderEpoch, setRenderEpoch] = useState(0);
  const hiddenNotesRef = useRef<Set<SVGElement>>(new Set());

  // Immutable Zustand snapshots are also created when an answer changes only
  // note.status. Depend on ENGRAVED musical data, not the array reference:
  // otherwise OSMD will re-render the whole score on every correct answer.
  const engravingKey = getExerciseEngravingKey(activeExerciseNotes);
  const xml = useMemo(() => {
    if (!activeExerciseNotes.length) return null;
    const score = createScoreFromExercise(activeExerciseNotes, currentTonality);
    return toMusicXml(score, {
      includeFingering: currentAppMode === 'hanon',
      includeSyllables: currentAppMode === 'hanon',
      hideInactiveStaffRests: true
    });
    // Equivalent musical input produces an identical score and XML even after
    // immutable status/index changes; intentionally omit array reference.
  }, [engravingKey, currentTonality, currentAppMode]);

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
        // The historical effective 1.0 zoom rendered tiny notation in a much taller
        // Zen canvas. Use OSMD's own engraving zoom, not a CSS-scaled SVG.
        // Re-evaluate on width changes and on entering/exiting focus.
        renderer.zoom = osmdZoomForWidth(container.clientWidth, zenRef.current);
        await renderer.render();
        if (!cancelled) {
          styleClefs(container);
          setLoadState('ready');
          osmdRef.current = renderer;
          positionTeachingCursor(renderer, currentOnsetTicks());
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
          darkMode: true,
          autoResize: false,
          drawingParameters: 'compacttight',
          drawTitle: false,
          drawPartNames: false,
          drawComposer: false,
          cursorsOptions: [{ type: 0, color: '#f59e0b', alpha: 0.34, follow: false }]
        });
        // Set OSMD's real engraving rules before loading: a dark piano
        // score with the final system stretched to the available width.
        const rules = renderer.EngravingRules;
        rules.StretchLastSystemLine = true;
        rules.RenderSingleHorizontalStaffline = false;
        rules.RenderMeasureNumbers = false;
        rules.PageBackgroundColor = '#0b1120';
        rules.DefaultColorMusic = '#f8fafc';
        rules.DefaultColorNotehead = '#f8fafc';
        rules.DefaultColorStem = '#f8fafc';
        rules.DefaultColorRest = '#94a3b8';
        rules.DefaultColorLabel = '#94a3b8';
        rules.StaffLineColor = '#334155';
        rules.PageTopMargin = 1.5;
        rules.PageBottomMargin = 1.5;
        rules.PageLeftMargin = 1.5;
        rules.PageRightMargin = 1.5;
        rules.SystemLeftMargin = 0;
        rules.SystemRightMargin = 0;
        rules.StaffDistance = 4.5;
        renderer.zoom = osmdZoomForWidth(container.clientWidth, zenRef.current);
        await renderer.load(xml);
        if (cancelled) return;
        requestEngravingRef.current = () => {
          if (renderer && renderer.zoom !== osmdZoomForWidth(container.clientWidth, zenRef.current)) {
            void runRender();
          }
        };
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
      requestEngravingRef.current = null;
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

  // Same loaded OSMD instance, unchanged MusicXML and scoring state:
  // Zen transitions only request an engraving-scale update if needed.
  useEffect(() => {
    requestEngravingRef.current?.();
  }, [zen]);

  // Note: MusicXML can contain rests on the other staff. A simple cursor.next()
  // per exercise note would drift. Match the cursor's musical timestamp instead.
  const noteOnsets = useMemo(() => getNoteOnsets(activeExerciseNotes), [activeExerciseNotes]);
  const onsetTicks = noteOnsets[activeNoteIndex] ?? 0;
  const lastTick = activeExerciseNotes.reduce((sum, note) => sum + note.durMultiplier * 4, 0);
  const totalBars = Math.max(1, Math.ceil(lastTick / TICKS_PER_MEASURE));
  const actualBar = Math.min(totalBars, Math.floor(onsetTicks / TICKS_PER_MEASURE) + 1);

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
        positionTeachingCursor(renderer, ticks);
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
      positionTeachingCursor(renderer, currentOnsetTicks());
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
    const points = new Map<number, EngravedPoint>();

    try {
      for (const index of new Set(guides.flatMap(g => [g.fromIndex, g.toIndex]))) {
        const point = getEngravedNotePoint(renderer, mount, noteOnsets[index]);
        if (point) points.set(index, point);
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
      positionTeachingCursor(renderer, currentOnsetTicks());
    }

    return () => {
      mount.querySelectorAll('[data-notare-interval-overlay="true"]').forEach(el => el.remove());
    };
  }, [activeExerciseNotes, noteOnsets, currentAppMode, loadState, renderEpoch]);


  // A reading trajectory, not a polyphonic performance overlay: the legacy
  // generator still emits bass downbeat followed by treble notes in sequence.
  // Anchor the vertical-then-horizontal "Г" path to actual engraved notes.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const selector = '[data-notare-gaze-overlay="true"]';
    const clear = () => mount.querySelectorAll(selector).forEach(el => el.remove());
    clear();
    if (loadState !== 'ready' || currentAppMode !== 'gpattern' || !osmdRef.current) return;

    const renderer = osmdRef.current;
    const guides = getGazeGuides(activeExerciseNotes);
    if (!guides.length) {
      setErrorMessage('Не удалось определить басовые опоры тактов. Используйте классический стан.');
      setLoadState('error');
      return;
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    try {
      for (const guide of guides) {
        const from = getEngravedNotePoint(renderer, mount, noteOnsets[guide.fromIndex]);
        const to = getEngravedNotePoint(renderer, mount, noteOnsets[guide.toIndex]);
        // SVG pages can differ. Never join notes across unrelated viewports.
        if (!from || !to || from.root !== to.root) continue;
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('data-notare-gaze-overlay', 'true');
        group.setAttribute('data-notare-gaze-measure', String(guide.measure));
        group.setAttribute('aria-hidden', 'true');
        group.setAttribute('pointer-events', 'none');

        const path = document.createElementNS(svgNS, 'path');
        // Begin above the bass notehead. Travel vertically toward the treble
        // staff then right to the melody, as the method teaches.
        const elbowY = to.y - 14;
        path.setAttribute('d',
          `M ${from.x} ${from.y - 12} L ${from.x} ${elbowY} L ${to.x - 12} ${elbowY}`);
        path.setAttribute('stroke', '#b45309');
        path.setAttribute('stroke-width', '2.3');
        path.setAttribute('stroke-dasharray', '5 3');
        path.setAttribute('fill', 'none');

        const label = document.createElementNS(svgNS, 'text');
        label.textContent = 'Г ➔';
        label.setAttribute('x', String(from.x - 11));
        label.setAttribute('y', String(elbowY - 8));
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('fill', '#92400e');

        group.append(path, label);
        from.root.appendChild(group);
      }
      if (!mount.querySelector(selector)) {
        setErrorMessage('Не удалось разместить траекторию «Г» на нотах OSMD. Используйте классический стан.');
        setLoadState('error');
      }
    } catch (error) {
      console.error('OSMD gaze guides failed', error);
      setErrorMessage('Не удалось разместить траекторию «Г» на нотах OSMD. Используйте классический стан.');
      setLoadState('error');
    } finally {
      positionTeachingCursor(renderer, currentOnsetTicks());
    }
    return clear;
  }, [activeExerciseNotes, noteOnsets, currentAppMode, loadState, renderEpoch]);


  // Hanon blocks are teaching annotations, not a replacement for engraving.
  // OSMD engraves articulation, syllables and finger numbers from MusicXML.
  // Brackets below are anchored to the generated noteheads, recalculated
  // after each resize and each newly generated exercise.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const selector = '[data-notare-hanon-block="true"]';
    const clear = () => mount.querySelectorAll(selector).forEach(el => el.remove());
    clear();
    if (loadState !== 'ready' || currentAppMode !== 'hanon' || !osmdRef.current) return;

    const renderer = osmdRef.current;
    const blocks = getHanonBlocks(activeExerciseNotes);
    const svgNS = 'http://www.w3.org/2000/svg';

    try {
      for (const block of blocks) {
        const points: EngravedPoint[] = [];
        for (let index = block.firstIndex; index <= block.lastIndex; index++) {
          const point = getEngravedNotePoint(renderer, mount, noteOnsets[index]);
          if (point) points.push(point);
        }
        // A block can span a wrapped system/page; never connect noteheads
        // across a wrap. Draw each contiguous visible fragment separately.
        const segments: EngravedPoint[][] = [];
        for (const point of points) {
          const segment = segments[segments.length - 1];
          const previous = segment?.[segment.length - 1];
          if (!segment || previous.root !== point.root || point.x < previous.x - 10) {
            segments.push([point]);
          } else {
            segment.push(point);
          }
        }
        for (const segment of segments) {
          const root = segment[0].root;
          const minX = Math.min(...segment.map(point => point.x)) - 11;
          const maxX = Math.max(...segment.map(point => point.x)) + 11;
          const topY = Math.min(...segment.map(point => point.y)) - 43;

          const group = document.createElementNS(svgNS, 'g');
          group.setAttribute('data-notare-hanon-block', 'true');
          group.setAttribute('data-notare-hanon-number', String(block.number));
          group.setAttribute('aria-hidden', 'true');
          group.setAttribute('pointer-events', 'none');

          const bracket = document.createElementNS(svgNS, 'path');
          bracket.setAttribute('d',
            `M ${minX} ${topY + 9} L ${minX} ${topY} L ${maxX} ${topY} L ${maxX} ${topY + 9}`);
          bracket.setAttribute('fill', 'none');
          bracket.setAttribute('stroke', '#be123c');
          bracket.setAttribute('stroke-width', '1.6');

          const label = document.createElementNS(svgNS, 'text');
          label.textContent = `БЛОК #${block.number}`;
          label.setAttribute('x', String((minX + maxX) / 2));
          label.setAttribute('y', String(topY - 6));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('font-size', '11');
          label.setAttribute('font-weight', 'bold');
          label.setAttribute('fill', '#9f1239');

          group.append(bracket, label);
          root.appendChild(group);
        }
      }
      if (!mount.querySelector(selector)) {
        setErrorMessage('Не удалось разместить блоки Ганона. Используйте классический стан.');
        setLoadState('error');
      }
    } catch (error) {
      console.error('OSMD Hanon block guides failed', error);
      setErrorMessage('Не удалось разместить блоки Ганона. Используйте классический стан.');
      setLoadState('error');
    } finally {
      positionTeachingCursor(renderer, currentOnsetTicks());
    }
    return clear;
  }, [activeExerciseNotes, noteOnsets, currentAppMode, loadState, renderEpoch]);


  // Bass landmarks are a transparent guide on the EXISTING OSMD staff.
  // VexFlow owns the five staff lines: getYForLine(1)=F3 (4th line from
  // bottom), getYForLine(4)=G2 (bottom line) in a standard F clef.
  // Do not estimate y from our exercise notes or re-create a custom staff.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const selector = '[data-notare-bass-landmark="true"]';
    const clear = () => mount.querySelectorAll(selector).forEach(element => element.remove());
    clear();
    if (!showBassLandmarks || loadState !== 'ready' || !osmdRef.current) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    let drawn = 0;

    try {
      for (const stave of getBassStaveGeometries(osmdRef.current, mount)) {
        const svg = stave.root;
        const landmarks = getBassLandmarkSegments({
          x: stave.x,
          width: stave.width,
          lineY: stave.lineY
        });
        if (landmarks.length !== 2) continue;
        for (const landmark of landmarks) {
            const group = document.createElementNS(svgNS, 'g');
            group.setAttribute('data-notare-bass-landmark', 'true');
            group.setAttribute('data-landmark-pitch', landmark.pitch);
            group.setAttribute('data-staff-line-index', String(landmark.lineFromTop));
            group.setAttribute('data-origin', 'vexflow-stave');
            group.setAttribute('aria-hidden', 'true');
            group.setAttribute('pointer-events', 'none');

            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', String(landmark.x1));
            line.setAttribute('x2', String(landmark.x2));
            line.setAttribute('y1', String(landmark.y));
            line.setAttribute('y2', String(landmark.y));
            line.setAttribute('stroke', landmark.pitch === 'F3' ? '#9333ea' : '#4f46e5');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-opacity', '0.68');
            line.setAttribute('stroke-dasharray', '6 4');

            const label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', String(landmark.x2 - 5));
            label.setAttribute('y', String(landmark.y - 5));
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-weight', 'bold');
            label.setAttribute('fill', landmark.pitch === 'F3' ? '#7e22ce' : '#3730a3');
            label.textContent = landmark.label;
            group.append(line, label);
            svg.appendChild(group);
            drawn++;
        }
      }
      if (drawn === 0) {
        setErrorMessage('Не удалось найти линейки басового ключа в OSMD. Используйте классический стан.');
        setLoadState('error');
      }
    } catch (error) {
      console.error('OSMD bass landmarks failed', error);
      setErrorMessage('Не удалось разместить маяки басового ключа. Используйте классический стан.');
      setLoadState('error');
    }

    return clear;
  }, [showBassLandmarks, loadState, renderEpoch]);

  return (
    <div data-testid="osmd-score" data-osmd-render-epoch={renderEpoch} data-active-note-index={activeNoteIndex} className="flex-1 min-h-0 w-full bg-slate-900/65 border border-slate-800/90 rounded-2xl relative flex flex-col p-2.5 overflow-hidden shadow-inner">
      {(!zen || currentAppMode === 'photo' || currentAppMode === 'rhythm' || showBassLandmarks) && (
      <div data-testid={zen ? 'zen-score-actions' : undefined} className="shrink-0 w-full flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5 text-xs">
        {!zen && <div className="flex items-center flex-wrap gap-2.5">
          <span className="flex items-center gap-1.5 font-mono text-slate-300 bg-slate-950/90 px-2.5 py-0.5 rounded-md border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            Такт: <strong className="text-white">{actualBar} / {totalBars}</strong>
          </span>
          <span className="text-slate-400">Сборник: <strong className="text-sky-400">{collectionNames[currentFilter]}</strong></span>
          <span className="hidden md:inline text-slate-600">•</span>
          <span className="hidden md:inline text-slate-400">Фокус: <strong className="text-emerald-400">Прямой рефлекс «Вижу знак → нажимаю клавишу»</strong></span>
        </div>}
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
          {(!zen || showBassLandmarks) && <button
            onClick={toggleBassLandmarks}
            title="Показать ориентиры F3 и G2 на линейках басового ключа OSMD"
            className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-md text-purple-300"
          >
            𝄢 Маяки баса: {showBassLandmarks ? 'ВКЛ' : 'ВЫКЛ'}
          </button>}
          {(!zen || currentAppMode === 'rhythm') && <button
            onClick={() => audioEngine.playSyllablePatternDemo('titi', bpm)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-amber-300"
          >
            <Volume2 className="w-3 h-3" /> Ритм-образец
          </button>}
          {(!zen || currentAppMode === 'rhythm') && <button
            onClick={cycleSpeechSuppressor}
            className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-amber-300"
            title="Сменить режим речевого сопровождения"
          >
            Речь: {speechLabels[speechSuppressor]}
          </button>}
        </div>
      </div>)}

      <div className="osmd-dark-theme relative flex-1 min-h-0 overflow-auto mt-2 rounded-lg bg-slate-950/90 text-slate-100">
        {currentAppMode === 'photo' && isPhotoMasked && (
          <div data-testid="photo-masked-notice" className="sticky top-0 z-20 mx-auto w-fit px-3 py-1 rounded-b-lg bg-cyan-950 text-cyan-100 text-xs pointer-events-none">
            Такт {actualBar} скрыт — играйте по памяти
          </div>
        )}
        <div ref={mountRef} className="w-full" aria-label="Нотная партитура OpenSheetMusicDisplay" />
        {loadState === 'loading' && (
          <div role="status" className="absolute inset-0 flex items-center justify-center bg-slate-950/95 text-slate-400 text-xs">
            Загрузка нотного стана…
          </div>
        )}
        {loadState === 'error' && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-rose-300 text-xs px-4 text-center">
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
