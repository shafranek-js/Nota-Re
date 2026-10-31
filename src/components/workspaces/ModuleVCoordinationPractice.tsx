import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, RotateCcw, Square, Play } from 'lucide-react';
import { audioEngine } from '../../core/audio/AudioEngine.ts';
import { midiManager } from '../../core/midi/MidiManager.ts';
import { initialTimedPractice, reduceTimedPractice, type TempoPlan,
  type TimedPracticeState } from '../../core/training/tempoTwoHand.ts';
import { assessPolyphonicPractice, type PolyphonicAssessment } from '../../core/training/polyphonicAssessment.ts';
import { createModuleVCoordinationFixture, COORDINATION_DESCRIPTIONS,
  MODULE_V_COORDINATION_COUNT } from '../../core/training/moduleVCoordination.ts';
import { loadV4, recordV4 } from '../../core/storage/moduleVCoordinationStorage.ts';
import { ModuleVInversionScore } from './ModuleVInversionScore.tsx';

type Feedback = TimedPracticeState['feedback'];
const FEEDBACK: Record<Feedback, string> = {
  'count-in': 'Идёт отсчёт. Пока не играйте.',
  ready: 'Играйте, читая две нотные строки.',
  partial: 'Не все звуки совместной атаки взяты. Проверьте обе руки.',
  correct: 'Правильное вступление обеих партий.',
  wrong: 'Неверная нота: проверьте высоту звука.',
  'off-beat': 'Атака вне ритмического окна.',
  'released-early': 'Клавиша отпущена до окончания записанной длительности.',
  'held-too-long': 'Клавиша удерживается дольше записанной длительности.',
  missed: 'Пропущено вступление: чтение продолжается по нотному времени.',
  complete: 'Попытка закончена. Результат приведён ниже.'
};

export const ModuleVCoordinationPractice: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [bpm, setBpm] = useState(60);
  const [clickEnabled, setClickEnabled] = useState(true);
  const [readyFixtureId, setReadyFixtureId] = useState('');
  const [journal, setJournal] = useState(loadV4);
  const [timed, setTimed] = useState<TimedPracticeState>(initialTimedPractice);
  const timedRef = useRef(timed);
  const [plan, setPlan] = useState<TempoPlan | null>(null);
  const planRef = useRef<TempoPlan | null>(null);
  const [clock, setClock] = useState(() => performance.now());
  const [assessment, setAssessment] = useState<PolyphonicAssessment | null>(null);
  const [message, setMessage] = useState('');
  const interval = useRef<number | null>(null);
  const clickStops = useRef<Array<() => void>>([]);
  const completed = useRef(false);
  const fixture = useMemo(() => createModuleVCoordinationFixture(index), [index]);
  const ready = readyFixtureId === fixture.id;

  const stopClock = () => {
    if (interval.current !== null) window.clearInterval(interval.current);
    interval.current = null;
    for (const cancel of clickStops.current) cancel();
    clickStops.current = [];
    planRef.current = null;
    setPlan(null);
  };
  const cancel = () => {
    stopClock();
    timedRef.current = initialTimedPractice();
    setTimed(timedRef.current);
    setAssessment(null);
    completed.current = false;
    setMessage('Попытка остановлена. Результат не сохранён.');
  };
  const finish = (next: TimedPracticeState, active: TempoPlan) => {
    if (completed.current) return;
    completed.current = true;
    const summary = assessPolyphonicPractice(fixture.score, fixture.steps, next);
    setAssessment(summary);
    setJournal(recordV4({
      fixtureId: fixture.id, bpm: active.bpm, matchedOnsets: summary.matchedOnsets,
      totalOnsets: summary.totalOnsets,
      rightMatched: summary.right.matched, rightExpected: summary.right.expected,
      leftMatched: summary.left.matched, leftExpected: summary.left.expected,
      ...summary.errors, clean: summary.clean
    }));
    stopClock();
    setMessage('Попытка завершена. Это диагностическая тренировка без зачёта.');
  };

  useEffect(() => {
    const detach = midiManager.onMidiEvent(event => {
      const active = planRef.current;
      if (!active || completed.current) return;
      if (event.type === 'sustain') return; // Pedal never fakes physical key-off.
      if (event.type === 'panic' || event.type === 'all-notes-off') {
        stopClock();
        setMessage('MIDI отключён или сброшен. Попытка прервана, результат не сохранён.');
        timedRef.current = initialTimedPractice();
        setTimed(timedRef.current);
        return;
      }
      if (event.type !== 'note-on' && event.type !== 'note-off') return;
      const next = reduceTimedPractice(
        timedRef.current, fixture.score, fixture.steps, active, event
      );
      timedRef.current = next;
      setTimed(next);
      if (next.finished) finish(next, active);
    });
    const onHidden = () => {
      if (document.hidden && planRef.current) {
        stopClock();
        timedRef.current = initialTimedPractice();
        setTimed(timedRef.current);
        setMessage('Вкладка скрыта. Попытка прервана, результат не сохранён.');
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      detach();
      document.removeEventListener('visibilitychange', onHidden);
      stopClock(); // No late metronome or hidden MIDI session on navigation.
    };
    // Fixture identity is the only score-related dependency. Settings cannot
    // silently swap the score or official assessment while a run is active.
  }, [fixture]);

  const restart = (nextIndex: number) => {
    stopClock();
    timedRef.current = initialTimedPractice();
    setTimed(timedRef.current);
    setAssessment(null);
    completed.current = false;
    setMessage('');
    if (nextIndex !== index) { setReadyFixtureId(''); setIndex(nextIndex); }
  };
  const start = async () => {
    if (!ready || planRef.current) return;
    setMessage('');
    await midiManager.init();
    if (midiManager.getInputsCount() === 0) {
      setMessage('Подключите физическую MIDI-клавиатуру. Виртуальные клавиши и микрофон здесь не оцениваются.');
      return;
    }
    const context = audioEngine.ensureAudioContext();
    if (!context) { setMessage('Аудиосистема недоступна для синхронизации метронома.'); return; }
    try {
      await context.resume();
      if (context.state !== 'running') throw new Error('AudioContext ещё не запущен.');
      const beatSeconds = 60 / bpm;
      const leadSeconds = fixture.score.beats * beatSeconds + 0.20;
      const musicalAudioStart = context.currentTime + leadSeconds;
      const active: TempoPlan = {
        startMs: performance.now() + leadSeconds * 1000,
        bpm, windowMs: 160, overlapMs: 140, holdGraceMs: 120
      };
      completed.current = false;
      timedRef.current = initialTimedPractice();
      setTimed(timedRef.current);
      setAssessment(null);
      planRef.current = active;
      setPlan(active);
      setClock(performance.now());
      const endTicks = Math.max(...fixture.score.notes.map(n => n.onsetTicks + n.durationTicks));
      if (clickEnabled) {
        for (let beat = -fixture.score.beats; beat <= endTicks / 4; beat++) {
          const at = musicalAudioStart + beat * beatSeconds;
          if (at >= context.currentTime + 0.008) {
            clickStops.current.push(audioEngine.scheduleMetronomeClick(
              beat % fixture.score.beats === 0, at
            ));
          }
        }
      }
      interval.current = window.setInterval(() => {
        const current = planRef.current;
        if (!current) return;
        const now = performance.now();
        setClock(now);
        const next = reduceTimedPractice(timedRef.current, fixture.score, fixture.steps,
          current, { type: 'tick', receivedAtMs: now });
        timedRef.current = next;
        setTimed(next);
        if (next.finished) finish(next, current);
      }, 35);
    } catch (error) {
      stopClock();
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const countIn = !!plan && clock < plan.startMs;
  const beat = plan ? Math.min(fixture.score.beats,
    Math.max(1, Math.ceil((plan.startMs - clock) / (60000 / plan.bpm)))) : 0;
  const progress = assessment ?? assessPolyphonicPractice(fixture.score, fixture.steps, timed);
  const currentStep = fixture.steps[Math.min(timed.stepIndex, fixture.steps.length - 1)];

  return (
    <div data-testid="module-v-v4-practice" className="min-w-0 flex flex-col gap-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="text-[11px] font-mono text-sky-300">V4 · module-v/v1/two-hands</p>
          <h2 className="text-base font-semibold text-white mt-1">Координация двух рук</h2>
          <p className="text-xs text-slate-400 mt-1">Пример {index + 1} из {MODULE_V_COORDINATION_COUNT}
            {' · '}Учебных попыток: {journal.attempts.length}</p>
        </div>
        <span className="text-[11px] text-amber-300">Физическое MIDI · без зачёта курса</span>
      </div>
      <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-xs text-slate-300 space-y-1.5">
        <strong className="block text-slate-100">План чтения · {fixture.score.beats}/4</strong>
        <p data-testid="module-v-v4-coaching">{COORDINATION_DESCRIPTIONS[fixture.pattern]}</p>
        <p>Смотрите обе строки до начала игры. Метроном отсчитывает один полный такт;
          ноты остаются видны. Руки начинают и отпускают звуки по собственным длительностям.</p>
        <p>Требуется клавиатура с достаточным диапазоном для настоящих басовых и верхних звуков.
          25-клавишное устройство не охватывает обе партии одновременно — автоматическое
          сжатие октав сознательно отключено.</p>
      </div>
      <div className="flex flex-wrap gap-3 items-center text-xs text-slate-200">
        <label className="inline-flex items-center gap-2">Темп:
          <select data-testid="module-v-v4-tempo" value={bpm} disabled={!!plan}
            onChange={e => setBpm(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-white">
            {[40, 50, 60, 70, 80, 100].map(value =>
              <option key={value} value={value}>{value} BPM</option>)}
          </select>
        </label>
        <label className="inline-flex gap-2 items-center">
          <input data-testid="module-v-v4-metronome" type="checkbox"
            checked={clickEnabled} disabled={!!plan} onChange={e => setClickEnabled(e.target.checked)}
            className="accent-sky-500" /> Метроном
        </label>
      </div>
      <div data-testid="module-v-v4-count-area"
        className="h-20 shrink-0 flex items-center justify-center text-center">
        {countIn ? <div role="status" data-testid="module-v-v4-count-in"
          className="flex items-center gap-3 text-slate-200">
          <span className="text-xs">Приготовьтесь</span>
          <strong data-testid="module-v-v4-count-beat"
            className="font-mono tabular-nums text-6xl leading-none text-emerald-300">{beat}</strong>
        </div> : <p className="text-xs text-slate-400">
          {plan ? 'Играйте по нотам' : assessment ? 'Попытка завершена' :
            ready ? 'Ноты видны. Можно начинать отсчёт.' : 'Загружаем нотный стан…'}
        </p>}
      </div>
      <ModuleVInversionScore score={fixture.score} testId="module-v-v4-score"
        ariaLabel="Независимая партия правой и левой руки на двух нотных станах, две меры."
        onReady={() => setReadyFixtureId(fixture.id)} />
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" data-testid="module-v-v4-start" onClick={() => void start()}
          disabled={!ready || !!plan}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-sky-500">
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Начать с отсчётом
        </button>
        <button type="button" data-testid="module-v-v4-stop" onClick={cancel}
          disabled={!plan} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">
          <Square className="h-3.5 w-3.5" aria-hidden="true" /> Остановить
        </button>
        <button type="button" data-testid="module-v-v4-retry"
          onClick={() => restart(index)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Повторить
        </button>
        <button type="button" data-testid="module-v-v4-next"
          onClick={() => restart((index + 1) % MODULE_V_COORDINATION_COUNT)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-xs text-slate-100">
          Следующий <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {message && <p data-testid="module-v-v4-message" role="status" className="text-xs text-amber-200">{message}</p>}
      <div data-testid="module-v-v4-diagnostics"
        className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200 space-y-2">
        <p data-testid="module-v-v4-feedback" aria-live="polite">{FEEDBACK[timed.feedback]}</p>
        {plan && !countIn && <p data-testid="module-v-v4-current-step">
          Вступление {Math.min(timed.stepIndex + 1, fixture.steps.length)} / {fixture.steps.length}
          {' · '}Момент в нотах: {currentStep.onsetTicks / 4 + 1} доля от начала
        </p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
          <span data-testid="module-v-v4-right">Правая: {progress.right.matched}/{progress.right.expected} нот</span>
          <span data-testid="module-v-v4-left">Левая: {progress.left.matched}/{progress.left.expected} нот</span>
          <span data-testid="module-v-v4-hits">Вступления: {progress.matchedOnsets}/{progress.totalOnsets}</span>
          <span data-testid="module-v-v4-misses">Пропуски: {progress.errors.misses}</span>
          <span>Неверные звуки: {progress.errors.wrongPitches}</span>
          <span>Вне ритма: {progress.errors.offBeatNotes}</span>
          <span>Раннее отпускание: {progress.errors.earlyReleases}</span>
          <span>Передержка: {progress.errors.overheldNotes}</span>
        </div>
        {assessment && <p data-testid="module-v-v4-result" className="text-sky-200">
          {assessment.clean ? 'Чистая учебная попытка.' : 'Есть ошибки или пропуски — можно повторить.'}
          {' '}Результат не влияет на зачёты уроков 1–12.
        </p>}
      </div>
    </div>
  );
};
