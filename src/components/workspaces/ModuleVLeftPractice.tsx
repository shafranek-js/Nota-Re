import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { midiManager, type MidiDeviceEvent } from '../../core/midi/MidiManager.ts';
import { spellLegacyMidi } from '../../core/notation/legacyScoreAdapter.ts';
import type { AccompanimentTexture } from '../../core/training/accompanimentStudy.ts';
import {
  createModuleVLeftFixture, evaluateModuleVLeftFixture, explainLeftTexture,
  MODULE_V_LH_COUNT, readLeftTexture
} from '../../core/training/moduleVLeftTextures.ts';
import { initialChordPractice, reduceChordPractice } from '../../core/training/twoHandPractice.ts';
import { loadV3, recordV3Attempt, recordV3MidiRehearsal, type V3Mode } from '../../core/storage/moduleVLeftStorage.ts';
import { ModuleVInversionScore } from './ModuleVInversionScore.tsx';

const OPTIONS: readonly { value: AccompanimentTexture; title: string }[] = [
  { value: 'alberti', title: 'Бас Альберти' },
  { value: 'waltz', title: 'Вальсовый аккомпанемент' },
  { value: 'arpeggio', title: 'Ломаное арпеджио' }
];

function writtenName(midi: number, fifths: number): string {
  const p = spellLegacyMidi(midi, fifths);
  return p.step + (p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : '') + p.octave;
}

export const ModuleVLeftPractice: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [shift, setShift] = useState<0 | 12>(0);
  const [mode, setMode] = useState<V3Mode>('guided');
  const [response, setResponse] = useState<AccompanimentTexture | null>(null);
  const [hint, setHint] = useState(false);
  const [method, setMethod] = useState(false);
  const [journal, setJournal] = useState(loadV3);
  const [midiActive, setMidiActive] = useState(false);
  const [midiState, setMidiState] = useState(initialChordPractice);
  const fixture = useMemo(() => createModuleVLeftFixture(index, shift), [index, shift]);
  const feedback = useMemo(() => response === null ? null :
    evaluateModuleVLeftFixture(fixture, response), [fixture, response]);
  const actual = readLeftTexture(fixture.score);
  // The answer is never interpolated into the markup until a user explicitly
  // requests guided reveal or submits a diagnostic answer.
  const revealed = !!feedback || (mode === 'guided' && hint);
  const answeredTexture = revealed ? actual : null;

  const resetMidi = () => { setMidiActive(false); setMidiState(initialChordPractice()); };
  const retry = () => { setResponse(null); setHint(false); setMethod(false); resetMidi(); };
  const next = () => { retry(); setIndex(i => (i + 1) % MODULE_V_LH_COUNT); };
  const selectMode = (newMode: V3Mode) => {
    if (newMode === mode) return;
    retry();
    setMode(newMode);
    // Do not reuse a just-revealed guided answer for independent recognition.
    setIndex(i => (i + 1) % MODULE_V_LH_COUNT);
  };
  const answer = (choice: AccompanimentTexture) => {
    if (response !== null) return;
    const result = evaluateModuleVLeftFixture(fixture, choice);
    setResponse(choice);
    setJournal(recordV3Attempt({
      fixtureId: fixture.id, mode, response: choice, correct: result.correct,
      usedHint: mode === 'guided' && hint
    }));
  };

  useEffect(() => {
    if (!midiActive || !feedback) return;
    void midiManager.init();
    const unsubscribe = midiManager.onMidiEvent((event: MidiDeviceEvent) => {
      if (event.type !== 'note-on' && event.type !== 'note-off' && event.type !== 'panic') return;
      setMidiState(previous => reduceChordPractice(
        previous, fixture.steps, event, 180, true
      ));
    });
    return unsubscribe;
  }, [midiActive, feedback, fixture]);

  useEffect(() => {
    if (!midiActive || midiState.stepIndex !== fixture.steps.length) return;
    setMidiActive(false);
    setJournal(recordV3MidiRehearsal(fixture.id, shift));
  }, [midiActive, midiState.stepIndex, fixture, shift]);

  const currentStep = fixture.steps[Math.min(midiState.stepIndex, fixture.steps.length - 1)];
  const finished = midiState.stepIndex >= fixture.steps.length;
  return (
    <div data-testid="module-v-v3-practice" className="min-w-0 flex flex-col gap-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="text-[11px] font-mono text-sky-300">V3 · module-v/v1/left-textures</p>
          <h2 className="text-base font-semibold text-white mt-1">Чтение фактуры левой руки</h2>
          <p className="text-xs text-slate-400 mt-1">
            Пример {index + 1} из {MODULE_V_LH_COUNT} ·
            {' '}Ответов: {journal.attempts.length} ·
            {' '}MIDI-репетиций: {journal.midiRehearsals.length}
          </p>
        </div>
        <span className="text-[11px] text-amber-300">Учебная практика · без зачёта</span>
      </div>

      <div role="group" aria-label="Режим чтения басовой фактуры" className="flex flex-wrap gap-2">
        <button type="button" data-testid="module-v-v3-guided"
          aria-pressed={mode === 'guided'} onClick={() => selectMode('guided')}
          className={`rounded-lg border px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${mode === 'guided' ? 'border-sky-500 bg-sky-900/40 text-white' : 'border-slate-700 text-slate-300'}`}>
          Обучение с подсказками
        </button>
        <button type="button" data-testid="module-v-v3-independent"
          aria-pressed={mode === 'independent'} onClick={() => selectMode('independent')}
          className={`rounded-lg border px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${mode === 'independent' ? 'border-sky-500 bg-sky-900/40 text-white' : 'border-slate-700 text-slate-300'}`}>
          Самостоятельное чтение
        </button>
      </div>
      <label className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
        Регистр для левой руки:
        <select data-testid="module-v-v3-octave" value={String(shift)}
          onChange={e => { setShift(e.target.value === '12' ? 12 : 0); resetMidi(); }}
          className="rounded-lg bg-slate-800 border border-slate-600 p-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          <option value="0">Оригинальный бас</option>
          <option value="12">На октаву выше · для короткой MIDI-клавиатуры</option>
        </select>
      </label>
      <p className="text-xs text-slate-300">
        Рассмотрите нижний стан: что происходит на долях такта и в какой последовательности движется бас?
        Название фактуры появится после вашего ответа.
      </p>
      <ModuleVInversionScore score={fixture.score} testId="module-v-v3-score"
        ariaLabel="Нотная запись партии левой руки, два такта. Прочитайте ритм и движение звуков и определите фактуру." />

      {mode === 'guided' && !feedback && (
        <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-300">
          <button type="button" data-testid="module-v-v3-method" aria-expanded={method}
            className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
            onClick={() => setMethod(v => !v)}>Как читать басовый рисунок?</button>
          {method && <p className="mt-2" data-testid="module-v-v3-method-content">
            Сначала найдите размер и сильную долю; затем определите, отдельные ли это
            восьмые или бас с аккордами на следующих долях. Сопоставьте движение по высоте нот.
          </p>}
          {!hint && <button type="button" data-testid="module-v-v3-hint"
            onClick={() => setHint(true)}
            className="block mt-2 text-amber-200 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
            Показать решение (попытка будет с подсказкой)
          </button>}
        </div>
      )}

      <fieldset disabled={response !== null} data-testid="module-v-v3-options">
        <legend className="text-xs font-semibold text-slate-100 mb-2">Какая фактура записана?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {OPTIONS.map(option => <button type="button" key={option.value}
            data-testid={`module-v-v3-answer-${option.value}`}
            onClick={() => answer(option.value)} disabled={response !== null}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-white hover:bg-slate-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
            {option.title}
          </button>)}
        </div>
      </fieldset>

      {answeredTexture && (
        <div role="status" aria-live="polite" data-testid="module-v-v3-feedback"
          className="rounded-lg border border-sky-700/40 bg-sky-950/25 p-3 text-xs text-slate-200 space-y-1.5">
          <strong className="block">
            {feedback ? (feedback.correct ? 'Правильно.' : 'Пока неверно.') : 'Разбор с подсказкой.'}
          </strong>
          <p>Записано: <strong>{OPTIONS.find(o => o.value === answeredTexture)?.title}</strong>.</p>
          <p>{explainLeftTexture(answeredTexture)}</p>
          <p>Размер: {fixture.score.beats}/4; первая басовая нота —
            {' '}{writtenName(fixture.score.notes[0].midi, fixture.score.fifths)}.
          </p>
          {hint && feedback && mode === 'guided' &&
            <p>Ответ был сделан после просмотра решения: это учебная попытка с подсказкой.</p>}
        </div>
      )}

      {feedback && (
        <div data-testid="module-v-v3-midi" className="rounded-lg border border-slate-700 p-3 space-y-2 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">Дополнительно: сыграть написанный бас на MIDI</p>
          <p>Только порядок и правильные высоты звуков. Темп, точная длительность,
            педаль, штрихи и метр не оцениваются. Для повторной атаки отпустите клавишу.
            Микрофон и виртуальная клавиатура не участвуют.</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span data-testid="module-v-v3-step">Событие {Math.min(midiState.stepIndex + 1, fixture.steps.length)} из {fixture.steps.length}</span>
            <button type="button" data-testid="module-v-v3-midi-start"
              onClick={() => { setMidiState(initialChordPractice()); setMidiActive(true); }}
              className="rounded-lg bg-sky-700 px-3 py-2 text-white hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
              {midiActive ? 'Начать MIDI-репетицию заново' : 'Начать MIDI-репетицию'}
            </button>
          </div>
          {(midiActive || finished) &&
            <p data-testid="module-v-v3-expected" className="text-sky-200">
              {finished ? 'Все записанные атаки воспроизведены. Это учебная репетиция, не зачёт.' :
                'Сыграйте: ' + currentStep.expectedMidi.map(n => writtenName(n, fixture.score.fifths)).join(' + ')}
            </p>}
          {midiActive && <p data-testid="module-v-v3-midi-status" role="status">
            {midiState.feedback === 'wrong' ? 'Неверная или лишняя клавиша. Отпустите её и повторите этот шаг.' :
              midiState.feedback === 'slow' ? 'Звуки аккорда нажаты слишком раздельно. Повторите вместе.' :
              midiState.feedback === 'partial' ? 'Удерживайте звуки аккорда вместе.' :
              'Ожидаю MIDI NoteOn от подключённой клавиатуры.'}
          </p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2 justify-between">
        <button type="button" data-testid="module-v-v3-retry" onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true"/> Повторить тот же пример
        </button>
        <button type="button" data-testid="module-v-v3-next" onClick={next}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          Следующий пример <ArrowRight className="h-3.5 w-3.5" aria-hidden="true"/>
        </button>
      </div>
    </div>
  );
};
