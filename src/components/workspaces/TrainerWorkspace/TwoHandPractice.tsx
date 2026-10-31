import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { midiManager } from '../../../core/midi/MidiManager';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { MetronomeToggle } from './MetronomeToggle';
import { MIDI_NOTE_MAP } from '../../../data/notes';
import { toMusicXml, type SupportedKey } from '../../../core/notation/musicXml';
import {
  createTwoHandPractice,
  initialChordPractice,
  reduceChordPractice,
  type ChordPracticeState,
  type PracticeMidiEvent,
  type TwoHandPattern
} from '../../../core/training/twoHandPractice';
import { useAppStore } from '../../../store/useAppStore';
import { currentScoreTick, initialTimedPractice, reduceTimedPractice,
  type TempoPlan, type TimedPracticeState } from '../../../core/training/tempoTwoHand';
import { assessPolyphonicPractice } from '../../../core/training/polyphonicAssessment';
import { createLessonTwoHandScore, lessonTwoHandStudyCount } from '../../../core/training/lessonTwoHandScore';
import { createChordStudy, type ChordQuality, type ChordInversion, type ChordStudy } from '../../../core/training/chordStudy';
import { createAccompanimentStudy, type AccompanimentStudy, type AccompanimentTexture, type AccompanimentHands } from '../../../core/training/accompanimentStudy';
import { assessLessonReleases } from '../../../core/training/lessonReleaseEvidence';
import { getTwoHandCourseTrialPreset } from '../../../core/training/twoHandCourseTrial';
import { loadTwoHandShadowSeries, saveTwoHandShadowSeries, clearTwoHandShadowSeries } from '../../../core/storage/twoHandShadowStorage';
import { appendShadowAttempt, evaluateTwoHandShadowAttempt, getTwoHandShadowPolicy,
  initialShadowSeries, nextTwoHandShadowStudy } from '../../../core/training/twoHandShadowSeries';

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

const timedFeedbackText: Record<TimedPracticeState['feedback'], string> = {
  'count-in': 'Подготовка: четыре удара метронома перед началом.',
  ready: 'Играйте строго в долю, слушая метроном.',
  partial: 'Удерживайте первую ноту аккорда до второй.',
  correct: 'Попадание в ритм.',
  wrong: 'Неверная нота.',
  'off-beat': 'Раньше или позже допустимого окна.',
  'released-early': 'Нота отпущена раньше её длительности.',
  'held-too-long': 'Нота удержана дольше написанной длительности — отпустите перед паузой.',
  missed: 'Доля пропущена — продолжайте со следующей.',
  complete: 'Ритмическая попытка завершена. Посмотрите результаты.'
};

const feedbackText: Record<ChordPracticeState['feedback'], string> = {
  ready: 'Нажмите показанные ноты на MIDI-клавиатуре.',
  partial: 'Одна нота нажата — удерживайте её и добавьте остальные.',
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
  const { currentTonality, scoreNoteCount, midiInputsCount, bpm,
    twoHandTrialLessonId, twoHandPracticeFocus, switchWorkspace, metronomeEnabled, audioEnabled } = useAppStore();
  const courseTrial = getTwoHandCourseTrialPreset(twoHandTrialLessonId);
  // A course trial uses the actual lesson's BPM without altering persistent
  // trainer preferences or the official per-lesson grade.
  const practiceBpm = courseTrial?.bpm ?? bpm;
  const practiceTonality = courseTrial?.tonality ?? currentTonality;
  // Canonical index of the CURRENT score. Only explicitly selecting the
  // next study changes the score; failed runs can replay identical notes.
  const [studyIndex, setStudyIndex] = useState(() => courseTrial
    ? nextTwoHandShadowStudy(loadTwoHandShadowSeries(courseTrial.lessonId)) ?? 0
    : 0);
  const [pattern, setPattern] = useState<TwoHandPattern>(
    () => getTwoHandCourseTrialPreset(twoHandTrialLessonId)?.pattern ?? 'steady'
  );
  const [studyFamily, setStudyFamily] = useState<'hands' | 'chords' | 'accompaniment'>(() =>
    courseTrial ? 'hands' : twoHandPracticeFocus
  );
  const [chordKey, setChordKey] = useState<SupportedKey>(currentTonality);
  const [chordQuality, setChordQuality] = useState<ChordQuality>('major');
  const [chordInversion, setChordInversion] = useState<ChordInversion>(0);
  const [texture, setTexture] = useState<AccompanimentTexture>('alberti');
  const [accompanimentHands, setAccompanimentHands] = useState<AccompanimentHands>('left');
  const isChordStudy = !courseTrial && studyFamily === 'chords';
  const isAccompaniment = !courseTrial && studyFamily === 'accompaniment';
  const harmonicStudy = isChordStudy || isAccompaniment;
  const exercise = useMemo(
    () => courseTrial
      ? createLessonTwoHandScore(courseTrial.lessonId, practiceTonality, studyIndex)
      : isChordStudy
        ? createChordStudy(chordKey, chordQuality, chordInversion)
        : isAccompaniment
          ? createAccompanimentStudy(chordKey, chordQuality, chordInversion,
            texture, accompanimentHands)
          : createTwoHandPractice(practiceTonality, scoreNoteCount === 8 ? 8 : 16, pattern),
    [courseTrial?.lessonId, practiceTonality, studyIndex, scoreNoteCount,
      pattern, isChordStudy, isAccompaniment, chordKey, chordQuality, chordInversion,
      texture, accompanimentHands]
  );
  const chordStudy: ChordStudy | null = isChordStudy ? exercise as ChordStudy : null;
  const accompaniment: AccompanimentStudy | null =
    isAccompaniment ? exercise as AccompanimentStudy : null;
  const xml = useMemo(() => toMusicXml(exercise.score), [exercise]);
  const [trial, setTrial] = useState<ChordPracticeState>(initialChordPractice);
  const trialRef = useRef(trial);
  const [timed, setTimed] = useState<TimedPracticeState>(initialTimedPractice);
  const timedRef = useRef(timed);
  const [plan, setPlan] = useState<TempoPlan | null>(null);
  const planRef = useRef<TempoPlan | null>(null);
  const [clockMs, setClockMs] = useState(() => performance.now());
  const timerRef = useRef<number | null>(null);
  const clickStops = useRef<Array<() => void>>([]);
  const scheduledStart = useRef<number | null>(null);
  const [tempoError, setTempoError] = useState('');
  // Session-local training evidence ONLY. The official Zustand course ledger
  // and completedLessons are not touched by any of these callbacks.
  const [shadowSeries, setShadowSeries] = useState(() =>
    loadTwoHandShadowSeries(courseTrial?.lessonId ?? null));
  // Duplicate/stale callbacks cannot reuse an attempt ID after reload.
  const attemptSerialRef = useRef(shadowSeries.lastAttemptId);
  useEffect(() => {
    if (courseTrial && shadowSeries.lessonId === courseTrial.lessonId) {
      saveTwoHandShadowSeries(shadowSeries);
    }
  }, [shadowSeries, courseTrial?.lessonId]);
  const activeAttemptRef = useRef<number | null>(null);
  const shadowPolicy = getTwoHandShadowPolicy(courseTrial?.lessonId ?? null);

  const recordAttempt = (completed: TimedPracticeState | null, currentPlan: TempoPlan | null) => {
    const id = activeAttemptRef.current;
    if (!courseTrial || id === null) return;
    activeAttemptRef.current = null;
    const verdict = completed && currentPlan
      ? evaluateTwoHandShadowAttempt(
          courseTrial.lessonId, exercise.score, exercise.steps, completed, currentPlan, studyIndex
        )
      : null; // Deliberate Stop, visibility loss, or interrupted attempt.
    setShadowSeries(previous => appendShadowAttempt(
      previous, courseTrial.lessonId, id, verdict
    ));
  };

  const stopTempo = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    for (const cancel of clickStops.current) cancel();
    clickStops.current = [];
    scheduledStart.current = null;
    planRef.current = null;
    setPlan(null);
  };
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [renderEpoch, setRenderEpoch] = useState(0);

  const resetTrial = () => {
    if (planRef.current && !timedRef.current.finished) recordAttempt(null, null);
    stopTempo();
    trialRef.current = initialChordPractice();
    timedRef.current = initialTimedPractice();
    setTrial(trialRef.current);
    setTimed(timedRef.current);
    setTempoError('');
  };

  const startTempo = async () => {
    // Closed-position triad introduction is deliberately an ungraded,
    // self-paced overlap check, not a timed/graded two-hand study.
    if (isChordStudy) return;
    stopTempo();
    const context = audioEngine.ensureAudioContext();
    if (!context) {
      setTempoError('Аудиосистема недоступна для синхронизации MIDI.');
      return;
    }
    try {
      await context.resume();
      if (context.state !== 'running') throw new Error('AudioContext не запущен');
      setTempoError('');
      // Anchor both the metronome and the incoming MIDI events to one
      // reference instant, with four full beats before the first attack.
      const beatSeconds = 60 / practiceBpm;
      const countInBeats = exercise.score.beats;
      const leadSeconds = countInBeats * beatSeconds + 0.20;
      const audioStart = context.currentTime + leadSeconds;
      scheduledStart.current = audioStart;
      const startMs = performance.now() + leadSeconds * 1000;
      const nextPlan: TempoPlan = {
        startMs, bpm: practiceBpm, windowMs: 160, overlapMs: 140, holdGraceMs: 120
      };
      timedRef.current = initialTimedPractice();
      setTimed(timedRef.current);
      trialRef.current = initialChordPractice();
      setTrial(trialRef.current);
      planRef.current = nextPlan;
      if (courseTrial) activeAttemptRef.current = ++attemptSerialRef.current;
      setPlan(nextPlan);
      setClockMs(performance.now());

      // Optional metronome clicks are scheduled by the effect below.
      timerRef.current = window.setInterval(() => {
        const currentPlan = planRef.current;
        if (!currentPlan) return;
        const now = performance.now();
        setClockMs(now);
        timedRef.current = reduceTimedPractice(
          timedRef.current, exercise.score, exercise.steps,
          currentPlan, { type: 'tick', receivedAtMs: now }
        );
        setTimed(timedRef.current);
        if (timedRef.current.finished) {
          recordAttempt(timedRef.current, currentPlan);
          if (timerRef.current !== null) window.clearInterval(timerRef.current);
          timerRef.current = null;
          for (const cancel of clickStops.current) cancel();
          clickStops.current = [];
          // Keep the completed plan for the result display and cursor.
        }
      }, 35);
    } catch (error) {
      stopTempo();
      setTempoError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    // Reschedule future clicks without touching the timed MIDI assessment.
    for (const cancel of clickStops.current) cancel();
    clickStops.current = [];
    if (!plan || timed.finished || !metronomeEnabled || !audioEnabled ||
        scheduledStart.current === null) return;
    const context = audioEngine.ensureAudioContext();
    if (!context) return;
    const beatSeconds = 60 / practiceBpm;
    const endTicks = Math.max(...exercise.score.notes.map(note =>
      note.onsetTicks + note.durationTicks));
    for (let beat = -exercise.score.beats; beat <= endTicks / 4; beat++) {
      const time = scheduledStart.current + beat * beatSeconds;
      if (time < context.currentTime + 0.008) continue;
      clickStops.current.push(audioEngine.scheduleMetronomeClick(beat % exercise.score.beats === 0, time));
    }
    return () => {
      for (const cancel of clickStops.current) cancel();
      clickStops.current = [];
    };
  }, [plan, timed.finished, metronomeEnabled, audioEnabled, exercise, practiceBpm]);

  useEffect(() => {
    // A different key signature, length or rhythm starts a new trial.
    resetTrial();
    // An exercise change or navigating away cancels scheduled clicks and
    // cannot leave a hidden timed session awarding progress.
    const detach = midiManager.onMidiEvent(event => {
      if (event.type === 'sustain') return;
      const relevant: PracticeMidiEvent | null =
        event.type === 'note-on' || event.type === 'note-off' ? event :
        event.type === 'panic' || event.type === 'all-notes-off' ? { type: 'panic' } : null;
      if (!relevant) return;
      const currentPlan = planRef.current;
      if (currentPlan) {
        if (timedRef.current.finished) return;
        timedRef.current = reduceTimedPractice(
          timedRef.current, exercise.score, exercise.steps, currentPlan, relevant
        );
        setTimed(timedRef.current);
        if (timedRef.current.finished) recordAttempt(timedRef.current, currentPlan);
      } else {
        trialRef.current = reduceChordPractice(trialRef.current, exercise.steps, relevant, 180, isChordStudy);
        setTrial(trialRef.current);
      }
    });
    const pauseWhenHidden = () => {
      if (document.hidden && planRef.current) {
        if (!timedRef.current.finished) recordAttempt(null, null);
        stopTempo();
        setTempoError('Попытка остановлена при переходе на другую вкладку.');
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      detach();
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      for (const cancel of clickStops.current) cancel();
      clickStops.current = [];
      planRef.current = null;
    };
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

  const activeStepIndex = plan ? timed.stepIndex : trial.stepIndex;
  const currentStep = exercise.steps[activeStepIndex];
  // OSMD cursors move at NOTE ONSETS, not at animation-frame frequency.
  // Resetting the full score cursor every 35 ms could block the JS thread
  // and make physically on-beat MIDI appear late during the count-in.
  const elapsedTick = plan ? currentScoreTick(plan, clockMs, exercise.score) : null;
  const cursorTick = elapsedTick === null
    ? (currentStep?.onsetTicks ?? exercise.steps[exercise.steps.length - 1].onsetTicks)
    : exercise.steps.reduce((onset, step) =>
      step.onsetTicks <= elapsedTick + 1e-6 ? step.onsetTicks : onset, 0);
  useEffect(() => {
    if (loadStatus !== 'ready' || !rendererRef.current) return;
    try { placeCursor(rendererRef.current, cursorTick); }
    catch (error) { console.warn('Two-hand cursor failed', error); }
  }, [cursorTick, loadStatus, renderEpoch]);

  const expected = currentStep?.expectedMidi
    .map(midi => MIDI_NAMES.get(midi) ?? String(midi)).join(' + ') ?? 'Готово';
  const assessment = useMemo(() =>
    plan && timed.finished
      ? assessPolyphonicPractice(exercise.score, exercise.steps, timed)
      : null,
    [plan, timed, exercise]
  );
  const releases = useMemo(() =>
    assessment && courseTrial ? assessLessonReleases(exercise.score, timed) : null,
    [assessment, courseTrial?.lessonId, exercise, timed]
  );
  const practiceProgress = shadowPolicy ? shadowSeries.successfulStudies.length : 0;
  const suggestedStudy = courseTrial ? nextTwoHandShadowStudy(shadowSeries) : null;
  const restNow = plan !== null && !timed.finished &&
    clockMs >= plan.startMs &&
    !exercise.score.notes.some(note =>
      note.onsetTicks <= elapsedTick! &&
      note.onsetTicks + note.durationTicks > elapsedTick!);


  const exportXml = () => {
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = isChordStudy ? 'notare-triad-inversions.musicxml' :
      isAccompaniment ? 'notare-accompaniment.musicxml' : 'notare-two-hands.musicxml';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section data-testid="two-hand-practice" data-timed-start-ms={plan?.startMs ?? ""} className="flex-1 min-h-[380px] w-full flex flex-col gap-2 rounded-xl bg-slate-900 border border-slate-700 p-3">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            {courseTrial?.title ?? (isChordStudy ? 'Трезвучия и обращения · MIDI' :
              isAccompaniment ? 'Фактуры левой руки · MIDI' : 'Две руки — одновременная игра (MIDI)')}
          </h2>
          {courseTrial && (
            <div data-testid="two-hand-trial-context" className="text-xs text-sky-200">
              Урок {courseTrial.lessonId} · Тональность <strong data-testid="two-hand-active-tonality">{practiceTonality}</strong> · Темп <strong data-testid="two-hand-active-bpm">{practiceBpm}</strong> BPM.
              {' '}{courseTrial.description}
              {pattern !== courseTrial.pattern && ' Выбран другой ритмический рисунок для дополнительной практики.'}
            </div>
          )}
          {courseTrial && (
            <p data-testid="two-hand-lesson-score" className="text-xs text-sky-300">
              {courseTrial.lessonId === 11
                ? 'Учебная партитура: бас на первую долю двух тактов; правая рука вступает на вторую.'
                : 'Учебная партитура: правая рука — legato восьмыми; левая — staccato четвертями.'}
              {' '}<strong data-testid="two-hand-study-label">
                Этюд {studyIndex + 1}/{lessonTwoHandStudyCount(courseTrial.lessonId)}
              </strong>
            </p>
          )}
          {chordStudy ? (
            <p className="text-xs text-amber-300" data-testid="chord-study-description">
              Первое знакомство: одна правая рука, четыре отдельных трёхзвучных аккорда.
              Нажмите все три клавиши в пределах 180 мс, удерживая их одновременно;
              отпустите клавиши перед повторением. Аппликатура и длительность здесь не оцениваются.
              Без метронома и без зачёта курса.
            </p>
          ) : isAccompaniment ? (
            <p className="text-xs text-amber-300" data-testid="accompaniment-description">
              Независимые вступления левой и правой рук. Сначала разучите левую руку,
              затем подключите правую при наличии достаточно широкой MIDI-клавиатуры.
              Свободная практика проверяет ноты; метрономная — также начало и отпускание
              по фактическим NoteOn/NoteOff. Без автоматического зачёта курса.
            </p>
          ) : (
            <p className="text-xs text-amber-300">Без зачёта курса. Свободный режим проверяет одновременные нажатия; ритмический — ещё и попадание в метроном, удержание баса и пропуски долей.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!isChordStudy && <MetronomeToggle />}
          {courseTrial && (
            <button type="button" data-testid="two-hand-next-study"
              disabled={(!!plan && !timed.finished) || suggestedStudy === null}
              onClick={() => {
                if (suggestedStudy === null) return;
                resetTrial();
                setStudyIndex(suggestedStudy);
              }}
              className="rounded border border-sky-600 px-3 py-1.5 text-xs text-sky-200 disabled:opacity-40">
              {suggestedStudy === null ? 'Все мини-этюды сыграны' :
                suggestedStudy === studyIndex ? 'Повторить текущий этюд' :
                  'Следующий этюд'}
            </button>
          )}
          {courseTrial && (
            <button type="button" data-testid="two-hand-back-to-course"
              onClick={() => switchWorkspace('course')}
              className="rounded border border-sky-600 px-3 py-1.5 text-xs text-sky-200">
              К уроку {courseTrial.lessonId}
            </button>
          )}
          {courseTrial && (
            <>
              <label htmlFor="two-hand-study-select" className="text-xs text-slate-300">
                Учебный этюд
              </label>
              <select id="two-hand-study-select" data-testid="two-hand-study-select"
                aria-label="Выбрать другой двухручный этюд"
                value={studyIndex}
                disabled={!!plan && !timed.finished}
                onChange={event => {
                  resetTrial();
                  setStudyIndex(Number(event.target.value));
                }}
                className="rounded border border-sky-600/60 bg-slate-800 px-2 py-1.5 text-xs text-white">
                {Array.from({ length: lessonTwoHandStudyCount(courseTrial.lessonId) }, (_, index) =>
                  <option key={index} value={index}>Этюд {index + 1}</option>
                )}
              </select>
            </>
          )}
          {!courseTrial && (
            <>
              <label htmlFor="two-hand-family" className="text-xs text-slate-300">Вид упражнения</label>
              <select id="two-hand-family" data-testid="two-hand-family" value={studyFamily}
                onChange={event => {
                  resetTrial();
                  setStudyFamily(event.target.value as 'hands' | 'chords' | 'accompaniment');
                }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
                <option value="hands">Независимые партии двух рук</option>
                <option value="chords">Трезвучия · одна рука</option>
                <option value="accompaniment">Фактуры левой руки</option>
              </select>
            </>
          )}
          {harmonicStudy && (
            <>
              <label htmlFor="chord-key" className="text-xs text-slate-300">Тональность</label>
              <select id="chord-key" data-testid="chord-key" value={chordKey}
                onChange={event => {
                  resetTrial();
                  setChordKey(event.target.value as SupportedKey);
                }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
                <option value="C">C-dur / a-moll (0 знаков)</option>
                <option value="G">G-dur / e-moll (1♯)</option>
                <option value="F">F-dur / d-moll (1♭)</option>
                <option value="D">D-dur / h-moll (2♯)</option>
              </select>
              <label htmlFor="chord-quality" className="text-xs text-slate-300">Лад</label>
              <select id="chord-quality" data-testid="chord-quality" value={chordQuality}
                onChange={event => {
                  resetTrial();
                  setChordQuality(event.target.value as ChordQuality);
                }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
                <option value="major">Мажор (тональное трезвучие)</option>
                <option value="minor">Параллельный минор (натуральное трезвучие)</option>
              </select>
              <label htmlFor="chord-inversion" className="text-xs text-slate-300">Расположение</label>
              <select id="chord-inversion" data-testid="chord-inversion" value={chordInversion}
                onChange={event => {
                  resetTrial();
                  setChordInversion(Number(event.target.value) as ChordInversion);
                }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
                <option value={0}>Основной вид (5/3)</option>
                <option value={1}>Первое обращение (6)</option>
                <option value={2}>Второе обращение (6/4)</option>
              </select>
            </>
          )}
          {accompaniment && (
            <>
              <label htmlFor="accompaniment-texture" className="text-xs text-slate-300">Фактура</label>
              <select id="accompaniment-texture" data-testid="accompaniment-texture" value={texture}
                disabled={!!plan && !timed.finished}
                onChange={event => { resetTrial(); setTexture(event.target.value as AccompanimentTexture); }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
                <option value="alberti">Бас Альберти (4/4)</option>
                <option value="waltz">Вальсовый бас и аккорды (3/4)</option>
                <option value="arpeggio">Ломаное арпеджио (4/4)</option>
              </select>
              <label htmlFor="accompaniment-hands" className="text-xs text-slate-300">Руки</label>
              <select id="accompaniment-hands" data-testid="accompaniment-hands"
                value={accompanimentHands} disabled={!!plan && !timed.finished}
                onChange={event => {
                  resetTrial(); setAccompanimentHands(event.target.value as AccompanimentHands);
                }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
                <option value="left">Только левая — короткая MIDI-клавиатура</option>
                <option value="both">Обе руки — полный регистр</option>
              </select>
            </>
          )}
          {!harmonicStudy && (
            <>
          <label htmlFor="two-hand-pattern" className="text-xs text-slate-300">Ритмический рисунок</label>
          <select id="two-hand-pattern" data-testid="two-hand-pattern"
            aria-label="Ритмический рисунок двух рук"
            disabled={!!courseTrial || (!!plan && !timed.finished)}
            value={pattern}
            onChange={event => {
              resetTrial();
              setPattern(event.target.value as TwoHandPattern);
            }}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white">
            <option value="steady">Ровные четверти и половинные</option>
            <option value="eighth-rests">Восьмые и паузы</option>
            <option value="staggered">Смещённые вступления и пунктир</option>
          </select>
            </>
          )}
          <button type="button" onClick={resetTrial} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white">Заново / Стоп</button>
          {!isChordStudy && (
            <button type="button" data-testid="two-hand-start-tempo" disabled={!!plan && !timed.finished}
              onClick={() => { void startTempo(); }}
              className="rounded bg-sky-700 disabled:opacity-40 px-3 py-1.5 text-xs text-white">
              {plan ? 'Повторить с метрономом' : `Играть по метроному · ${exercise.score.beats} доли`}
            </button>
          )}
          <button type="button" onClick={exportXml} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white">MusicXML</button>
        </div>
      </div>
      {accompaniment && (
        <div data-testid="accompaniment-details"
          className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-2 text-xs text-slate-200">
          <strong>{accompaniment.tonicName}{chordQuality === 'major' ? '-dur' : '-moll'}</strong>
          {' '}· {accompaniment.beats}/4 · {accompaniment.description}
          <span className="block mt-1">
            Бас: <strong data-testid="accompaniment-left-notes">
              {accompaniment.leftNotes.join(' · ')}
            </strong>. {accompanimentHands === 'both'
              ? <>Правая рука: <strong data-testid="accompaniment-right-notes">
                {accompaniment.rightNotes.join(' · ')}
              </strong> (обращение {chordInversion + 1}/3).</>
              : 'Правая рука отключена — ноты для неё не оцениваются.'}
          </span>
          <span className="block text-slate-400 mt-1">
            Нижний регистр начинается ниже C3 для некоторых тональностей;
            25-клавишный контроллер обычно годится только для разучивания одной руки.
            Аппликатура не подтверждается MIDI.
          </span>
          {midiInputsCount === 0 && (
            <span role="status" className="block text-amber-300 mt-1">
              Подключите физическую MIDI-клавиатуру для проверки; партитура и MusicXML доступны и без неё.
            </span>
          )}
        </div>
      )}
      {chordStudy && (
        <div data-testid="chord-study-details" className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-2 text-xs text-slate-200">
          <strong>{chordStudy.tonicName}{chordQuality === 'major' ? '-dur' : '-moll'}</strong>
          {' '}· {chordStudy.inversionName} ·
          {' '}ноты <strong data-testid="chord-notes">{chordStudy.pitchNames.join(' · ')}</strong>.
          <span className="block mt-1 text-slate-400">
            {chordQuality === 'minor'
              ? 'Параллельный натуральный минор: ключевые знаки сохраняются от выбранной мажорной тональности.'
              : 'Трезвучие в выбранной мажорной тональности.'}
            {' '}Первые три звука одновременно; нет требований к номеру пальца.
          </span>
          {midiInputsCount === 0 && (
            <span role="status" data-testid="chord-midi-required" className="block mt-1 text-amber-300">
              Для практики подключите физическую MIDI-клавиатуру; чтение нот и экспорт MusicXML доступны без неё.
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <span>Шаг <strong data-testid="two-hand-step-index">{Math.min(activeStepIndex + 1, exercise.steps.length)}</strong> / {exercise.steps.length}</span>
        <span data-testid="two-hand-mode">{plan ? (timed.finished ? 'Ритм завершён' : 'Ритм · метроном') : 'Свободная практика'}</span>
        <span>Момент: <strong>{currentStep ? currentStep.onsetTicks / 4 + 1 : '—'}</strong> доля</span>
        <span>Следующее вступление: <strong data-testid="two-hand-expected" className="text-sky-300">{expected}</strong></span>
        <span className="text-slate-400">MIDI: {midiInputsCount > 0 ? 'подключено' : 'нет устройства'}</span>
      </div>
      {courseTrial && shadowPolicy && (
        <div data-testid="two-hand-shadow-series"
          className="rounded-lg border border-sky-700/50 bg-sky-900/20 p-3 text-xs text-slate-200 space-y-1">
          <p className="font-semibold text-sky-200">Предварительная серия повторений — без зачёта курса</p>
          <p>Тренировочная цель: <strong data-testid="two-hand-shadow-progress">
            {practiceProgress}/{shadowPolicy.requiredCleanStudies}
          </strong> {shadowPolicy.consecutive ? 'чистых повторений подряд' : 'чистых повторений'}.
            {' '}Всего попыток: {shadowSeries.attempts}; чистых: {shadowSeries.accepted};
            ошибок: {shadowSeries.rejected}; прервано: {shadowSeries.aborted}.
            {' '}Разных успешно сыгранных: {shadowSeries.successfulStudies.length}.
          </p>
          <p data-testid="two-hand-shadow-last-result">
            {shadowSeries.attempts === 0 ? 'Завершённых попыток пока нет.' :
              shadowSeries.lastVerdict === null ? 'Серия восстановлена; подробности прошлой попытки не сохраняются.' :
              shadowSeries.lastVerdict.accepted
                ? 'Предыдущий мини-этюд сыгран чисто (только тренировочная проверка).'
                : shadowSeries.lastVerdict.reasons.includes('duplicate-study')
                  ? 'Этот мини-этюд уже учтён. Для следующего результата нужна другая партитура.'
                  : 'Предыдущая попытка не соответствует предварительным критериям.'}
          </p>
          {shadowSeries.practiceTargetReached &&
            <p data-testid="two-hand-shadow-target" className="text-emerald-300">
              Все разные тренировочные мини-этюды пройдены. Это НЕ закрывает урок.
            </p>}
          <p className="text-slate-400">
            Каждый номер серии имеет свою партитуру; повтор того же номера
            не считается новым успехом. Порог средней ошибки вступлений: 110 мс; нужны все ноты и правильные
            физические отпускания. В учебной программе точность ≥
            {shadowPolicy.curriculumAccuracyPercent}% и реакция
            {shadowPolicy.curriculumReactionMs} мс относятся к ДРУГОМУ нормативу,
            не заменяются этим метрономным тестом. Аппликатура и музыкальное legato
            здесь не подтверждаются.
          </p>
          <button type="button" data-testid="two-hand-shadow-reset"
            onClick={() => {
              resetTrial();
              clearTwoHandShadowSeries(courseTrial.lessonId);
              setShadowSeries(initialShadowSeries(courseTrial.lessonId));
              setStudyIndex(0);
            }}
            className="rounded border border-sky-600/60 px-2 py-1 text-sky-200">
            Сбросить тренировочную серию
          </button>
        </div>
      )}
      {plan && <div data-testid="two-hand-timed-stats" className="flex flex-wrap gap-3 text-xs text-slate-200">
        <span>В долю: <strong>{timed.hits}</strong></span>
        <span>Пропущено: <strong>{timed.misses}</strong></span>
        <span>Ранних отпусканий: <strong>{timed.earlyReleases}</strong></span>
        <span>Передержано нот: <strong>{timed.overheldNotes}</strong></span>
        <span>Ошибочных нот: <strong>{timed.wrongPitches}</strong></span>
        <span>Отклонение: <strong>{timed.lastDeviationMs === null ? '—' : timed.lastDeviationMs + ' мс'}</strong></span>
      </div>}
      {restNow && <p data-testid="two-hand-rest-now" role="status"
        className="text-xs text-amber-300">Пауза в обеих руках — не нажимайте клавиши.</p>}
      {!plan && !harmonicStudy && pattern !== 'steady' && <p className="text-xs text-slate-400">
        В свободной практике паузы отображаются в нотах. Контроль их длительности работает при игре с метрономом.
      </p>}
      {assessment && (
        <div data-testid="two-hand-assessment" className="rounded-lg border border-slate-600 bg-slate-800/70 p-3 text-xs text-slate-100" role="region" aria-label="Диагностика двухручного исполнения">
          <p className="font-semibold text-sm">
            {assessment.readyForCourseTrial
              ? (courseTrial ? 'Чистое исполнение пробного ритмического задания' : 'Чистое исполнение — готовность к пробным заданиям')
              : 'Диагностика: есть пункты для повторной тренировки'}
          </p>
          <p className="text-slate-300">Это диагностическая проверка, а не зачёт урока. Прогресс курса не изменяется.</p>
          {releases && (
            <div data-testid="two-hand-release-evidence" className="mt-2 border-t border-slate-600 pt-2 space-y-1">
              <p>Физические отпускания: <strong>{releases.observed}/{releases.expected}</strong> ·
                legato <strong>{releases.legato.observed}/{releases.legato.expected}</strong> ·
                staccato <strong>{releases.staccato.observed}/{releases.staccato.expected}</strong></p>
              <p data-testid="two-hand-release-verdict" className={releases.validated
                ? 'text-emerald-300' : 'text-amber-300'}>
                {releases.validated
                  ? 'Длительность удержания по указанным штрихам проверена по NoteOff.'
                  : 'Не все отпускания и длительности подтверждены MIDI.'}
              </p>
              <p className="text-slate-400">MIDI не распознаёт номера пальцев и не доказывает музыкальную выразительность legato.
                Автоматический зачёт по этой проверке отключён.</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span data-testid="two-hand-rh-accuracy">Правая рука: <strong>{assessment.right.matched}/{assessment.right.expected} ({assessment.right.accuracyPercent}%)</strong></span>
            <span data-testid="two-hand-lh-accuracy">Левая рука: <strong>{assessment.left.matched}/{assessment.left.expected} ({assessment.left.accuracyPercent}%)</strong></span>
            <span>Совпавшие вступления: <strong>{assessment.matchedOnsets}/{assessment.totalOnsets}</strong></span>
            <span>Среднее отклонение: <strong>{assessment.meanAbsoluteDeviationMs === null
              ? 'нет данных' : assessment.meanAbsoluteDeviationMs + ' мс'}</strong></span>
            <span>Вне ритма: <strong>{assessment.errors.offBeatNotes}</strong></span>
            <span>Сбои MIDI: <strong>{assessment.errors.interruptions}</strong></span>
          </div>
          <p data-testid="two-hand-assessment-verdict" className="mt-2 font-semibold">
            {assessment.readyForCourseTrial ? 'Готов к пробному заданию' : 'Нужна практика'}
          </p>
          <ul className="mt-1 list-disc list-inside text-slate-300">
            {assessment.recommendations.map(text => <li key={text}>{text}</li>)}
          </ul>
        </div>
      )}
      {tempoError && <p role="alert" className="text-xs text-rose-300">{tempoError}</p>}
      <p data-testid="two-hand-feedback" role="status" className="text-sm text-emerald-300">{plan ? (timed.feedback === 'count-in'
          ? `Подготовка: ${exercise.score.beats} удара метронома перед началом.`
          : timedFeedbackText[timed.feedback]) : feedbackText[trial.feedback]}</p>
      <div className="relative flex-1 min-h-[230px] overflow-auto rounded-lg bg-white">
        <div ref={mountRef} aria-label="Независимые партии двух рук OpenSheetMusicDisplay"
          className="min-h-[220px] w-full" />
        {loadStatus === 'loading' && <div role="status" className="absolute inset-0 grid place-items-center bg-white/90 text-sm text-slate-700">Загрузка двухручной партитуры…</div>}
        {loadStatus === 'error' && <div role="alert" className="absolute inset-0 grid place-items-center bg-white/95 text-sm text-red-800">Ошибка OSMD: {loadError}</div>}
      </div>
    </section>
  );
};
