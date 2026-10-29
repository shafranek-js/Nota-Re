import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { midiManager } from '../../../core/midi/MidiManager';
import { MIDI_NOTE_MAP } from '../../../data/notes';
import { toMusicXml } from '../../../core/notation/musicXml';
import {
  createTwoHandPractice,
  initialChordPractice,
  reduceChordPractice,
  type ChordPracticeState,
  type PracticeMidiEvent
} from '../../../core/training/twoHandPractice';
import { useAppStore } from '../../../store/useAppStore';

const MIDI_NAMES = new Map(Object.entries(MIDI_NOTE_MAP).map(([name, note]) => [note.midi, name]));

function placeCursor(renderer: OpenSheetMusicDisplay, ticks: number): void {
  const cursor = renderer.cursor;
  cursor.reset();
  let count = 0;
  while (!cursor.Iterator.EndReached &&
    cursor.Iterator.currentTimeStamp.RealValue + 1e-6 < ticks / 16 && count++ < 512) {
    cursor.next();
  }
  cursor.show();
}

const feedbackText: Record<ChordPracticeState['feedback'], string> = {
  ready: 'Нажмите показанные ноты на MIDI-клавиатуре.',
  partial: 'Одна нота нажата — удерживайте её и добавьте вторую.',
  correct: 'Верно. Следующий момент партитуры.',
  wrong: 'Другая нота. Отпустите лишние клавиши и повторите.',
  slow: 'Ноты прозвучали не вместе. Отпустите и повторите аккорд.',
  complete: 'Упражнение выполнено. Можно начать заново.'
};

/**
 * Standalone MIDI-only polyphonic practice. Deliberately does NOT update
 * the course's sequential activeNoteIndex, attempts, or certifications.
 */
export const TwoHandPractice: React.FC = () => {
  const { currentTonality, scoreNoteCount, midiInputsCount } = useAppStore();
  const exercise = useMemo(
    () => createTwoHandPractice(currentTonality, scoreNoteCount === 8 ? 8 : 16),
    [currentTonality, scoreNoteCount]
  );
  const xml = useMemo(() => toMusicXml(exercise.score), [exercise]);
  const [trial, setTrial] = useState<ChordPracticeState>(initialChordPractice);
  const trialRef = useRef(trial);
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [renderEpoch, setRenderEpoch] = useState(0);

  const resetTrial = () => {
    trialRef.current = initialChordPractice();
    setTrial(trialRef.current);
  };

  useEffect(() => {
    resetTrial();
    return midiManager.onMidiEvent(event => {
      if (event.type === 'sustain') return; // Pedal does not mean physically held keys.
      const relevant: PracticeMidiEvent | null =
        event.type === 'note-on' || event.type === 'note-off' ? event :
        event.type === 'panic' || event.type === 'all-notes-off' ? { type: 'panic' } : null;
      if (!relevant) return;
      trialRef.current = reduceChordPractice(trialRef.current, exercise.steps, relevant);
      setTrial(trialRef.current);
    });
  }, [exercise]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let cancelled = false;
    let renderer: OpenSheetMusicDisplay | null = null;
    let observer: ResizeObserver | null = null;
    let busy = false;
    let rerender = false;
    let width = host.clientWidth;
    setLoadStatus('loading');
    setLoadError('');

    const render = async () => {
      if (cancelled || !renderer) return;
      if (busy) { rerender = true; return; }
      busy = true;
      try {
        await renderer.render();
        if (!cancelled) {
          rendererRef.current = renderer;
          setLoadStatus('ready');
          setRenderEpoch(n => n + 1);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadStatus('error');
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        busy = false;
        if (rerender && !cancelled) {
          rerender = false;
          void render();
        }
      }
    };

    const initialize = async () => {
      try {
        const { OpenSheetMusicDisplay: OSMD } = await import('opensheetmusicdisplay');
        if (cancelled) return;
        renderer = new OSMD(host, {
          backend: 'svg',
          autoResize: false,
          drawingParameters: 'compacttight',
          drawTitle: false,
          drawPartNames: false,
          drawComposer: false,
          cursorsOptions: [{ type: 0, color: '#0ea5e9', alpha: 0.3, follow: false }]
        });
        renderer.zoom = 0.85;
        await renderer.load(xml);
        if (cancelled) return;
        await render();
        if (cancelled) return;
        observer = new ResizeObserver(() => {
          const nextWidth = host.clientWidth;
          if (nextWidth < 50 || Math.abs(nextWidth - width) < 3) return;
          width = nextWidth;
          void render();
        });
        observer.observe(host);
      } catch (error) {
        if (!cancelled) {
          setLoadStatus('error');
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      observer?.disconnect();
      rendererRef.current = null;
      try { renderer?.cursor?.Dispose(); } catch { /* not ready */ }
      try { renderer?.clear(); } catch { /* not ready */ }
      host.replaceChildren();
    };
  }, [xml]);

  const currentStep = exercise.steps[trial.stepIndex];
  useEffect(() => {
    if (loadStatus !== 'ready' || !rendererRef.current) return;
    try { placeCursor(rendererRef.current, currentStep?.onsetTicks ?? exercise.steps.at(-1)!.onsetTicks); }
    catch (error) { console.warn('Two-hand cursor failed', error); }
  }, [currentStep, exercise, loadStatus, renderEpoch]);

  const expected = currentStep?.expectedMidi
    .map(midi => MIDI_NAMES.get(midi) ?? String(midi)).join(' + ') ?? 'Готово';

  const exportXml = () => {
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'notare-two-hands.musicxml';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section data-testid="two-hand-practice" className="flex-1 min-h-[380px] w-full flex flex-col gap-2 rounded-xl bg-slate-900 border border-slate-700 p-3">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Две руки — одновременная игра (MIDI)</h2>
          <p className="text-xs text-amber-300">Отдельный практикум без зачёта курса. Оцениваем перекрытие физических нажатий; точность ритма по метрономy пока не оценивается.</p>
        </div>
        <div className="flex gap-2 items-center">
          <button type="button" onClick={resetTrial} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white">Заново</button>
          <button type="button" onClick={exportXml} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white">MusicXML</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <span>Шаг <strong data-testid="two-hand-step-index">{Math.min(trial.stepIndex + 1, exercise.steps.length)}</strong> / {exercise.steps.length}</span>
        <span>Момент: <strong>{currentStep ? currentStep.onsetTicks / 4 + 1 : '—'}</strong> доля</span>
        <span>Играть вместе: <strong data-testid="two-hand-expected" className="text-sky-300">{expected}</strong></span>
        <span className="text-slate-400">MIDI: {midiInputsCount > 0 ? 'подключено' : 'нет устройства'}</span>
      </div>
      <p data-testid="two-hand-feedback" role="status" className="text-sm text-emerald-300">{feedbackText[trial.feedback]}</p>
      <div className="relative flex-1 min-h-[230px] overflow-auto rounded-lg bg-white">
        <div ref={mountRef} aria-label="Независимые партии двух рук OpenSheetMusicDisplay"
          className="min-h-[220px] w-full" />
        {loadStatus === 'loading' && <div role="status" className="absolute inset-0 grid place-items-center bg-white/90 text-sm text-slate-700">Загрузка двухручной партитуры…</div>}
        {loadStatus === 'error' && <div role="alert" className="absolute inset-0 grid place-items-center bg-white/95 text-sm text-red-800">Ошибка OSMD: {loadError}</div>}
      </div>
    </section>
  );
};
