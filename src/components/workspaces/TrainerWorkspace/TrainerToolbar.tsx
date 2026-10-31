import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import type { ScoreRenderer } from '../../../core/notation/scoreRendererPreference';
import type { AppMode, FilterType, HanonType, SpeechType, TonalityKey } from '../../../types/music';
import type { KeyboardLabelMode } from '../../../core/storage/trainerPreferences';
import { useAppStore } from '../../../store/useAppStore';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { MetronomeToggle } from './MetronomeToggle';
import { downloadExerciseMusicXml } from '../../../core/notation/downloadMusicXml';
import { ChevronDown, ClipboardCheck, FileDown, Mic, Pause, Play, RotateCw, Square, Keyboard, Music2, EyeOff, Monitor, MapPin } from 'lucide-react';

type Panel = 'mode' | 'material' | 'rhythm' | 'view' | 'actions';

const MODES: readonly { id: AppMode; name: string; description: string }[] = [
  { id: 'reflex', name: '1. Рефлекс', description: 'Мгновенно узнавайте отдельные ноты и находите нужную клавишу.' },
  { id: 'rhythm', name: '2. Ритмослоги', description: 'Читайте длительности группами и произносите слоги.' },
  { id: 'lookahead', name: '3. Бегунок (+1)', description: 'Переводите взгляд к следующей ноте раньше пальцев.' },
  { id: 'photo', name: '4. Фото-память', description: 'Запомните такт до появления маски.' },
  { id: 'intervals', name: '5. Интервалы', description: 'Определяйте расстояние между нотами по нотному стану.' },
  { id: 'gpattern', name: '6. Буква «Г»', description: 'Тренируйте взгляд между двумя нотными станами.' },
  { id: 'blind', name: '7. Вслепую', description: 'Находите клавиши по группам чёрных клавиш, не глядя вниз.' },
  { id: 'hanon', name: '8. Ганон и штрихи', description: 'Упражнения на независимость пальцев и артикуляцию.' }
];
const FILTERS: readonly { id: FilterType; name: string }[] = [
  { id: 'treble', name: '200 упр. (C4–G4)' },
  { id: 'treble_oct2', name: '2-я октава (C4–D5)' },
  { id: 'bass', name: 'Литовко: Бас' },
  { id: 'both', name: 'Два нотных стана' }
];
const HANON_PRESETS: readonly { id: HanonType; name: string }[] = [
  { id: 'hanon1', name: 'Ганон №1 · прямой и обратный ход' },
  { id: 'hanon2', name: 'Ганон №2 · 4-й и 5-й пальцы' },
  { id: 'groups4', name: 'Черни · блоки по 4 ноты' },
  { id: 'coord', name: 'Стаккато + легато · координация' }
];
const KEY_LABELS: readonly { id: KeyboardLabelMode; name: string }[] = [
  { id: 'notes', name: 'Названия нот (C, D, E…)' },
  { id: 'off', name: 'Без подписей' },
  { id: 'pc', name: 'Клавиши ПК' }
];
const controlClass = 'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 hover:border-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400';
const activeClass = 'rounded-lg border border-emerald-500/60 bg-emerald-500 text-slate-950 px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400';
const inactiveClass = 'rounded-lg border border-slate-700 bg-slate-900 text-slate-200 px-3 py-2 text-xs hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400';

export const TrainerToolbar: React.FC<{ renderer: ScoreRenderer; onSelectRenderer: (renderer: ScoreRenderer) => void }> = ({ renderer, onSelectRenderer }) => {
  const root = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  const [panel, setPanel] = useState<Panel | null>(null);
  const {
    currentAppMode, setAppMode, currentFilter, setClefFilter, currentTonality, changeTonality,
    scoreNoteCount, toggleScoreDensity, bpm, setBpm, isContinuousFlow, trainerPhase,
    toggleContinuousFlow, regenerateExercise, activeExerciseNotes,
    currentHanonType, setHanonType, speechSuppressor, setSpeechSuppressor,
    photoExposureMs, setPhotoExposure, isBlindfolded, toggleBlindfoldKeys,
    isTabletopMode, toggleTabletopMode, showScaleHighlight, toggleScaleHighlight,
    showBassLandmarks, toggleBassLandmarks, showVirtualKeyboard, toggleVirtualKeyboard,
    keyboardLabelMode, setKeyboardLabelMode, midiInputsCount, toggleTwoHandPractice,
    startTrainerExercise, stopTrainerExercise, openTrainerPrecheck, activeLessonId, zenModeEnabled, zenSessionStarted, zenDismissedForSession, setAutoZenEnabled,
    adaptiveReflexEnabled, adaptiveStats, adaptiveTrace, toggleAdaptiveReflex, clearAdaptiveStats
  } = useAppStore();

  useLayoutEffect(() => {
    if (zenSessionStarted && zenDismissedForSession) {
      root.current?.querySelector<HTMLButtonElement>('[data-testid="toolbar-trigger-view"]')?.focus();
    }
    // Focus after returning from the temporarily dismissed Zen view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPanel(null);
      const trigger = root.current?.querySelector<HTMLButtonElement>(`#${id}-${panel}`);
      trigger?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [panel, id]);

  const previewNotes = () => audioEngine.playSequence(activeExerciseNotes.map(note => ({
    freq: note.freq, durMultiplier: note.durMultiplier, articulation: note.articulation
  })), bpm);

  const exportMusicXml = () => {
    try {
      downloadExerciseMusicXml(activeExerciseNotes, currentTonality, currentAppMode);
    } catch (error) {
      console.error('MusicXML export failed', error);
      window.alert('Не удалось экспортировать упражнение в MusicXML.');
    }
  };

  const trigger = (kind: Panel, title: string) => (
    <button type="button" id={`${id}-${kind}`}
      data-testid={`toolbar-trigger-${kind}`}
      aria-controls={`${id}-panel`} aria-expanded={panel === kind}
      onClick={() => setPanel(current => current === kind ? null : kind)}
      className={panel === kind ? activeClass : inactiveClass}>
      <span className="inline-flex items-center gap-1">{title}<ChevronDown aria-hidden="true" className="w-3 h-3"/></span>
    </button>
  );

  const iconOption = (label: string, selected: boolean, onClick: () => void, Icon: typeof Keyboard, tooltip = label) => (
    <button type="button" title={tooltip} aria-label={label} aria-pressed={selected}
      onClick={onClick} className={`${selected ? activeClass : inactiveClass} inline-flex h-9 w-9 shrink-0 items-center justify-center !p-0`}>
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );

  const optionButton = (label: string, selected: boolean, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={selected} onClick={onClick}
      className={selected ? activeClass : inactiveClass}>{label}</button>
  );

  return (
    <div ref={root} data-testid="trainer-toolbar"
      className="relative z-10 shrink-0 min-w-0 rounded-xl border border-slate-800 bg-slate-900/95 shadow-sm">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto px-2 py-2 custom-scroll whitespace-nowrap">
        <div className="flex shrink-0 gap-1.5" role="group" aria-label="Настройки упражнения">
          {trigger('mode', 'Режим')}
          {trigger('material', 'Материал')}
          {trigger('rhythm', 'Ритм и темп')}
          {trigger('view', 'Вид')}
        </div>
        <span className="mx-0.5 h-5 shrink-0 border-l border-slate-700" aria-hidden="true"/>
        <label className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-400">
          Темп
          <span className="font-mono text-amber-300 tabular-nums w-7 text-right">{bpm}</span>
          <input aria-label="Темп BPM" type="range" min={40} max={130} value={bpm}
            onChange={event => setBpm(Number(event.target.value))} className="w-14 accent-emerald-500"/>
        </label>
        <MetronomeToggle />
        <button type="button" onClick={toggleContinuousFlow} className={controlClass}
          title="Включить или приостановить ритмический автоход">
          <span className="inline-flex items-center gap-1">
            {isContinuousFlow ? <Pause aria-hidden="true" className="w-3 h-3"/> :
              <Play aria-hidden="true" className="w-3 h-3"/>}
            {isContinuousFlow && trainerPhase === 'playing' ? 'Поток: ИДЁТ' :
              isContinuousFlow ? 'Поток: готов' : 'Поток: Пауза'}
          </span>
        </button>
        <div data-testid={trainerPhase === 'setup' ? 'trainer-setup' : undefined}
          role="group"
          aria-label={trainerPhase === 'setup' ? 'Упражнение готово; ноты ещё не оцениваются' : 'Управление упражнением'}
          className="ml-auto shrink-0 flex gap-1.5">
          <button type="button" data-testid="toolbar-precheck" onClick={() => {
            setPanel(null);
            openTrainerPrecheck();
          }} title="Необязательный анализ нот перед первым звуком"
            className={controlClass}>
            <span className="inline-flex items-center gap-1">
              <ClipboardCheck aria-hidden="true" className="w-3.5 h-3.5"/>
              Анализ
            </span>
          </button>
          <button type="button"
            onClick={trainerPhase === 'setup' ? startTrainerExercise : stopTrainerExercise}
            data-testid="trainer-start-stop"
            className={trainerPhase === 'setup' ? activeClass : controlClass}>
            <span className="inline-flex items-center gap-1">
              {trainerPhase === 'setup' ? <Play aria-hidden="true" className="w-3 h-3"/> :
                <Square aria-hidden="true" className="w-3 h-3"/>}
              {trainerPhase === 'setup' ? 'Начать упражнение' : 'Остановить'}
            </span>
          </button>
          {trigger('actions', 'Действия')}
        </div>
      </div>
      {panel && (
        <section id={`${id}-panel`} data-testid={`toolbar-panel-${panel}`}
          role="region" aria-labelledby={`${id}-${panel}`}
          className={`min-w-0 border-t border-slate-700 px-3 max-h-[min(48vh,380px)] overflow-y-auto ${panel === 'view' ? 'py-1.5' : 'py-3 space-y-2'}`}>
          {panel === 'mode' && (
            <>
              <p className="text-xs text-slate-400">Выберите методику чтения с листа.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {MODES.map(mode => (
                  <button key={mode.id} type="button" aria-pressed={currentAppMode === mode.id}
                    onClick={() => {
                      setAppMode(mode.id);
                      setPanel(null);
                    }}
                    className={`${currentAppMode === mode.id ? 'border-emerald-500/70 bg-emerald-500/15' :
                      'border-slate-700 bg-slate-950 hover:border-sky-600'} border rounded-xl p-2.5 text-left`}>
                    <span className="block text-xs font-semibold text-slate-100">{mode.name}</span>
                    <span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">{mode.description}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === 'material' && (
            <>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  Тональность / ключевые знаки
                  <select aria-label="Тональность" value={currentTonality}
                    onChange={event => changeTonality(event.target.value as TonalityKey)} className={controlClass}>
                    <option value="C">C-dur / a-moll · 0 знаков</option>
                    <option value="G">G-dur / e-moll · Фа♯</option>
                    <option value="F">F-dur / d-moll · Си♭</option>
                    <option value="D">D-dur / h-moll · Фа♯, До♯</option>
                  </select>
                </label>
                <button type="button" onClick={toggleScoreDensity} className={controlClass}>
                  {scoreNoteCount} нот
                </button>
              </div>
              <p className="text-xs text-slate-400">Диапазон / набор упражнений</p>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map(filter => optionButton(filter.name, currentFilter === filter.id,
                  () => setClefFilter(filter.id)))}
              </div>
              <div className="mt-2 rounded-lg border border-sky-700/35 bg-slate-950 p-2 text-xs text-slate-300"
                data-testid="adaptive-reflex-controls">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" data-testid="adaptive-reflex-toggle"
                    aria-pressed={adaptiveReflexEnabled}
                    disabled={activeLessonId !== null || isContinuousFlow ||
                      currentAppMode !== 'reflex' || currentFilter === 'both' ||
                      trainerPhase === 'countIn' ||
                      (trainerPhase === 'playing' && useAppStore.getState().attemptEvents.length > 0)}
                    onClick={toggleAdaptiveReflex}
                    title="Только свободная, пошаговая практика Рефлекс, без зачёта и без изменения других режимов"
                    className={adaptiveReflexEnabled ? activeClass : inactiveClass}>
                    Адаптивный Рефлекс: {adaptiveReflexEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>
                  <span data-testid="adaptive-evidence-count">
                    Записей: {Object.values(adaptiveStats.notes).reduce((sum, stat) => sum + stat.observations, 0)}
                  </span>
                  <button type="button" className={controlClass} onClick={() => {
                    const json = JSON.stringify(adaptiveStats, null, 2);
                    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'notare-adaptive-statistics.json';
                    link.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}>Экспорт данных</button>
                  <button type="button" className={controlClass}
                    onClick={() => {
                      if (window.confirm('Удалить локальную статистику адаптивных упражнений? Сертификаты и история курса не изменятся.')) clearAdaptiveStats();
                    }}>Сбросить статистику</button>
                </div>
                <p className="mt-1 text-slate-400">
                  Только режим «Рефлекс», один нотный стан, без потока и зачёта.
                  Считаются подтверждённые самостоятельные ответы ПК/MIDI раздельно.
                  Пять чистых быстрых попаданий по одной ноте снимают её штраф ошибок.
                </p>
                {adaptiveTrace && adaptiveReflexEnabled && activeLessonId === null && (
                  <p className="mt-1" data-testid="adaptive-trace">
                    Seed: {adaptiveTrace.seed} · {adaptiveTrace.source === 'midi' ? 'MIDI' : 'ПК'} ·
                    {' '}вес ошибок +0,1, медленной реакции +0,5;
                    {' '}следующая выборка: {adaptiveTrace.chosen.slice(0, 8).join(' ')}.
                    <span className="sr-only"> Вес и число наблюдений по нотам:
                      {adaptiveTrace.candidates.map(item =>
                        ` ${item.noteName}: ${item.weight.toFixed(2)} при ${item.sampleCount} наблюдениях.`).join('')}
                    </span>
                  </p>
                )}
              </div>
              {currentAppMode === 'hanon' && (
                <>
                  <p className="text-xs text-slate-400">Профиль Ганона / Черни</p>
                  <div className="flex flex-wrap gap-2">
                    {HANON_PRESETS.map(preset => optionButton(preset.name, currentHanonType === preset.id,
                      () => setHanonType(preset.id)))}
                  </div>
                </>
              )}
            </>
          )}
          {panel === 'rhythm' && (
            <>
              <p className="text-xs text-slate-400">Темп и поток доступны в основной строке панели. Слуховые образцы не оцениваются.</p>
              <label className="flex flex-col gap-1 w-fit text-xs text-slate-300">
                Подсказки ритмослогов
                <select aria-label="Подсказки ритмослогов" value={speechSuppressor}
                  onChange={event => setSpeechSuppressor(event.target.value as SpeechType)}
                  className={controlClass}>
                  <option value="count">Счёт</option>
                  <option value="tata">ТА–ТА</option>
                  <option value="syllables">Ритмослоги</option>
                  <option value="solfege">Сольфеджио</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {(['ta', 'titi', 'tiritiri', 'taa'] as const).map(name => (
                  <button key={name} type="button" className={controlClass}
                    onClick={() => audioEngine.playSyllablePatternDemo(name, bpm)}>
                    {({ ta: 'ТА', titi: 'ТИ-ТИ', tiritiri: 'ТИ-РИ-ТИ-РИ', taa: 'ТА-А' })[name]}
                  </button>
                ))}
                <button type="button" className={controlClass} onClick={() => audioEngine.playArticulationDemo(bpm)}>
                  Штрихи: стаккато / легато
                </button>
                {(midiInputsCount > 0 || currentFilter === 'both' ||
                  currentAppMode === 'hanon' || currentAppMode === 'gpattern') && (
                    <button type="button" className={controlClass} onClick={toggleTwoHandPractice}>
                      Две руки одновременно · MIDI (бета)
                    </button>
                  )}
              </div>
            </>
          )}
          {panel === 'view' && (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap custom-scroll pb-1" data-testid="view-controls-row">
              <label className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-700/40 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer">
                <input type="checkbox" data-testid="auto-zen-setting"
                  checked={zenModeEnabled} onChange={event => setAutoZenEnabled(event.target.checked)}
                  className="accent-emerald-500" />
                Авто Zen при старте
              </label>
              <span className="mx-0.5 h-5 shrink-0 border-l border-slate-700" aria-hidden="true" />
              <span className="shrink-0 text-xs text-slate-400">Ноты:</span>
              <div role="group" aria-label="Способ отображения нот" className="flex shrink-0 items-center gap-1">
                {optionButton('OSMD', renderer === 'osmd', () => onSelectRenderer('osmd'))}
                {optionButton('Классический', renderer === 'legacy', () => onSelectRenderer('legacy'))}
              </div>
              <span className="mx-1 h-5 shrink-0 border-l border-slate-700" aria-hidden="true" />
              {iconOption(showVirtualKeyboard ? 'Скрыть клавиатуру' : 'Показать клавиатуру',
                showVirtualKeyboard, toggleVirtualKeyboard, Keyboard)}
              {iconOption('Подсветка гаммы', showScaleHighlight, toggleScaleHighlight, Music2,
                'Подсветить на клавиатуре ноты выбранной тональности.')}
              {iconOption('Тактильная ширма (18:20)', isBlindfolded, toggleBlindfoldKeys, EyeOff)}
              {iconOption('Режим «Стол» (22:05)', isTabletopMode, toggleTabletopMode, Monitor)}
              {iconOption('Маяки баса', showBassLandmarks, toggleBassLandmarks, MapPin)}
              <label className="shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-300">
                Подписи клавиш
                <select aria-label="Подписи виртуальных клавиш" value={keyboardLabelMode}
                  onChange={event => setKeyboardLabelMode(event.target.value as KeyboardLabelMode)}
                  className={controlClass}>
                  {KEY_LABELS.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
                </select>
              </label>
              {currentAppMode === 'photo' && (
                <label className="shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-300">
                  Экспозиция
                  <select aria-label="Экспозиция фото-памяти" value={photoExposureMs}
                    onChange={event => setPhotoExposure(Number(event.target.value))} className={controlClass}>
                    <option value={1100}>1,1 с</option>
                    <option value={1800}>1,8 с</option>
                    <option value={2400}>2,4 с</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {panel === 'actions' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={controlClass} onClick={previewNotes}
                title="Слуховое предслышание: прослушать мелодию голосом">
                <span className="inline-flex items-center gap-1"><Mic className="w-3 h-3"/> Петь / прослушать</span>
              </button>
              <button type="button" className={controlClass} onClick={exportMusicXml}
                title="Скачать текущие ноты в формате MusicXML">
                <span className="inline-flex items-center gap-1"><FileDown className="w-3 h-3"/> MusicXML</span>
              </button>
              <button type="button" className={controlClass} onClick={() => {
                regenerateExercise();
                setPanel(null);
              }} title="Сгенерировать новое упражнение">
                <span className="inline-flex items-center gap-1"><RotateCw className="w-3 h-3"/> Новый</span>
              </button>
            </div>
          )}
          {panel !== 'view' && <p className="text-[11px] text-slate-500">
            {activeLessonId !== null
              ? 'Изменение учебных параметров завершает зачёт текущего урока.'
              : 'Настройки упражнения автоматически сохраняются на этом устройстве.'}
          </p>}
        </section>
      )}
    </div>
  );
};
