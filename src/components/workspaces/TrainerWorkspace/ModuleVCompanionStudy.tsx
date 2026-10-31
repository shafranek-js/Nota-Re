import React, { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../../core/audio/AudioEngine.ts';
import { midiManager } from '../../../core/midi/MidiManager.ts';
import { useAppStore } from '../../../store/useAppStore.ts';
import type { AccompanimentStudy } from '../../../core/training/accompanimentStudy.ts';
import { initialPolyphonicTrial, planGeneratedHandRehearsal,
  recordPolyphonicKey, startPolyphonicTrial,
  type PolyphonicTrial } from '../../../core/training/repertoirePolyphonicTrial.ts';

interface Props {
  study: AccompanimentStudy;
  bpm: number;
  midiInputsCount: number;
  onActiveChange: (active: boolean) => void;
}

/**
 * Optional, session-only Module V teaching aid. It does not update the
 * existing rhythm diagnostics, standalone trial, course series or certificate.
 * Only physical MIDI input can satisfy a target; companion audio is output.
 */
export const ModuleVCompanionStudy: React.FC<Props> = ({
  study, bpm, midiInputsCount, onActiveChange
}) => {
  const [hand, setHand] = useState<'left' | 'right'>('left');
  const [trial, setTrial] = useState<PolyphonicTrial>(initialPolyphonicTrial);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const plan = useMemo(() => planGeneratedHandRehearsal(study.score, bpm, hand),
    [study, bpm, hand]);
  const generation = useRef(0);
  const ownedAudio = useRef(false);
  const lastCompanion = useRef(-1);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const stop = () => {
    generation.current++;
    lastCompanion.current = -1;
    if (ownedAudio.current) audioEngine.clearPreviewTimeouts();
    ownedAudio.current = false;
    setPreparing(false);
    setTrial(initialPolyphonicTrial());
    onActiveChangeRef.current(false);
  };

  useEffect(() => {
    const stopHidden = () => { if (document.hidden) stop(); };
    const unsubscribe = useAppStore.subscribe((current, previous) => {
      if (current.isSettingsOpen && !previous.isSettingsOpen) stop();
    });
    document.addEventListener('visibilitychange', stopHidden);
    return () => {
      generation.current++;
      if (ownedAudio.current) audioEngine.clearPreviewTimeouts();
      ownedAudio.current = false;
      onActiveChangeRef.current(false);
      document.removeEventListener('visibilitychange', stopHidden);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    stop();
    setError('');
  }, [plan]);

  useEffect(() => {
    if (trial.phase !== 'playing') return;
    return midiManager.onMidiEvent(event => {
      if (event.type === 'panic' || event.type === 'all-notes-off') {
        stop();
        return;
      }
      if ((event.type !== 'note-on' && event.type !== 'note-off') || document.hidden)
        return;
      const app = useAppStore.getState();
      if (app.isSettingsOpen || app.currentWorkspace !== 'trainer') return;
      setTrial(prev => recordPolyphonicKey(prev, plan, {
        type: event.type, note: event.note
      }));
    });
  }, [trial.phase, plan]);

  useEffect(() => {
    const completed = trial.completedStepIndex;
    if (completed === null || completed <= lastCompanion.current) return;
    lastCompanion.current = completed;
    const tones = plan.steps[completed]?.companion ?? [];
    if (tones.length && audioEngine.playRepertoireCompanion(tones)) {
      ownedAudio.current = true;
    }
  }, [trial.completedStepIndex, plan]);

  const start = async () => {
    if (preparing || trial.phase === 'playing' || !!plan.reason || midiInputsCount === 0) return;
    stop();
    setError('');
    const id = generation.current;
    setPreparing(true);
    try {
      if (!audioEngine.getAudioEnabled()) throw new Error('Включите звук для сопровождения.');
      const ctx = audioEngine.ensureAudioContext();
      if (!ctx) throw new Error('Web Audio недоступен.');
      await ctx.resume();
      if (ctx.state !== 'running') throw new Error('Аудиовыход не запущен.');
      await audioEngine.prepareSoundFont();
      if (id !== generation.current) return;
      const status = audioEngine.getSoundFontStatus();
      if (status.output === 'soundfont' && status.phase !== 'ready')
        throw new Error('SoundFont ещё не готов.');
      setTrial(startPolyphonicTrial(plan));
      onActiveChangeRef.current(true);
    } catch (cause) {
      if (id === generation.current)
        setError(cause instanceof Error ? cause.message : 'Не удалось начать практику.');
    } finally {
      if (id === generation.current) setPreparing(false);
    }
  };

  return (
    <section data-testid="module-v-companion" aria-label="Пошаговая практика с сопровождением"
      className="rounded-lg border border-sky-700/50 bg-sky-950/20 px-3 py-2 space-y-2 text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-sky-200">Практика с сопровождением другой руки</strong>
        <span className="text-amber-300">Без зачёта · без метронома</span>
      </div>
      <p className="text-slate-400">
        Нажимайте ноты выбранной руки на MIDI-клавиатуре. После правильной группы
        приложение озвучит партию второй руки, сохранив относительный ритм между
        шагами. Длительности и синхронность не оцениваются.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="module-v-companion-hand">Я играю</label>
        <select id="module-v-companion-hand" data-testid="module-v-companion-hand"
          disabled={trial.phase === 'playing' || preparing}
          value={hand} onChange={event => setHand(event.target.value as 'left' | 'right')}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-white">
          <option value="left">Левую · правая звучит</option>
          <option value="right">Правую · левая звучит</option>
        </select>
        <button type="button" data-testid="module-v-companion-toggle"
          disabled={preparing || (trial.phase === 'idle' && (!!plan.reason || midiInputsCount === 0))}
          onClick={() => { if (trial.phase === 'playing') stop(); else void start(); }}
          className="rounded bg-sky-700 px-3 py-1.5 text-white disabled:opacity-40">
          {preparing ? 'Подготовка…' : trial.phase === 'playing'
            ? '■ Остановить' : trial.phase === 'complete' ? '↻ Повторить' : '▶ Играть'}
        </button>
      </div>
      <p data-testid="module-v-companion-status" role="status" className="text-sky-200">
        {trial.phase === 'playing'
          ? `Шаг ${trial.index + 1}/${plan.steps.length} · завершено: ${trial.correct} · ошибок: ${trial.wrong} · ожидаются MIDI-клавиши: ${plan.steps[trial.index]?.targets.map(n => n.midi).join(', ')}`
          : trial.phase === 'complete'
            ? `Выполнено ${trial.correct} шагов · ошибок: ${trial.wrong} · без зачёта`
            : plan.reason ?? (midiInputsCount === 0
              ? 'Подключите физическую MIDI-клавиатуру.'
              : 'Нажмите «Играть», чтобы начать пошаговое сопровождение.')}
      </p>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </section>
  );
};
