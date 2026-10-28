import React from 'react';
import { useAppStore, WorkspaceTab } from '../../store/useAppStore';
import { COURSE_CURRICULUM } from '../../data/curriculum';
import { Settings, Volume2, VolumeX, Music } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentWorkspace,
    switchWorkspace,
    completedLessons,
    selectedLessonId,
    currentAppMode,
    currentFilter,
    totalAttempts,
    correctHits,
    currentStreak,
    bestStreak,
    reactionTimes,
    completedExercisesCount,
    midiInputsCount,
    audioEnabled,
    toggleAudioMaster,
    toggleSettingsDrawer
  } = useAppStore();

  const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
  const accuracy = totalAttempts > 0 ? Math.round((correctHits / totalAttempts) * 100) : null;
  const recentSpeeds = reactionTimes.slice(-15);
  const avgSpeed = recentSpeeds.length > 0
    ? Math.round(recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length)
    : null;

  const modeLabels: Record<string, string> = {
    reflex: 'Рефлекс',
    rhythm: 'Ритмослоги',
    lookahead: 'Бегунок (+1)',
    photo: 'Фото-память',
    intervals: 'Интервалы',
    gpattern: 'Буква «Г»',
    blind: 'Вслепую',
    hanon: 'Ганон & Штрихи'
  };

  const filterLabels: Record<string, string> = {
    treble: '200 упр. (C4-G4)',
    treble_oct2: '2-я окт. (C4-D5)',
    bass: 'Литовко (Бас)',
    both: '2 руки (Буква Г)'
  };

  const tabs: { id: WorkspaceTab; icon: string; label: string; badge?: string }[] = [
    { id: 'course', icon: '🎓', label: 'Курс (12 уроков)' },
    { id: 'trainer', icon: '🎹', label: 'Тренажёр-Студия' },
    { id: 'precheck', icon: '🧭', label: 'Доигровой анализ & Круг' },
    { id: 'lab', icon: '💪', label: 'Лаборатория', badge: 'Ганон & Ритм' },
    { id: 'theory', icon: '📚', label: 'Библиотека (60+ книг)' }
  ];

  return (
    <header className="shrink-0 w-full min-h-12 bg-slate-900/95 border-b border-slate-800/90 px-3 py-1.5 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 z-30">
      {/* Логотип и общий прогресс курса */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-md shadow-emerald-950/60">
          <Music className="w-4 h-4 text-slate-950 stroke-[2.5]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-white">NotaRe Academy</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
              Курс: {completedLessons.length} / 12 уроков
            </span>
          </div>
          <p className="text-[10px] text-slate-400 hidden sm:block">
            Урок {lesson.id} • {modeLabels[currentAppMode] || currentAppMode} • {filterLabels[currentFilter]}
          </p>
        </div>
      </div>

      {/* Центральный переключатель 5 рабочих пространств */}
      <nav aria-label="Рабочие пространства" className="order-3 xl:order-none w-full xl:w-auto min-w-0 max-w-full flex items-center overflow-x-auto bg-slate-950 p-1 rounded-xl border border-slate-800 custom-scroll">
        {tabs.map(tab => {
          const isActive = currentWorkspace === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchWorkspace(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="hidden xl:inline text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Правый блок: Телеметрия + MIDI + Звук + Настройки */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden 2xl:flex items-center gap-2.5 bg-slate-950/90 border border-slate-800 px-3 py-1 rounded-lg text-xs">
          <div className="flex items-center gap-1" title="Точность попаданий в текущей сессии">
            <span className="text-slate-500">Точность:</span>
            <span className="font-mono font-bold text-emerald-400">{accuracy === null ? '—' : `${accuracy}%`}</span>
            <span className="text-[10px] text-slate-500">({totalAttempts})</span>
          </div>
          <div className="w-px h-3.5 bg-slate-800"></div>
          <div className="flex items-center gap-1" title="Непрерывная серия верных нот">
            <span className="text-slate-500">Серия:</span>
            <span className="font-mono font-bold text-sky-400">{currentStreak}</span>
            <span className="text-[10px] text-slate-500">рек: {bestStreak}</span>
          </div>
          <div className="w-px h-3.5 bg-slate-800"></div>
          <div className="flex items-center gap-1" title="Средняя скорость реакции (порог автоматизма < 550 мс)">
            <span className="text-slate-500">Отклик:</span>
            <span className="font-mono font-bold text-amber-400">{avgSpeed === null ? '—' : `${avgSpeed} ms`}</span>
          </div>
          <div className="w-px h-3.5 bg-slate-800"></div>
          <div className="flex items-center gap-1" title="Сыграно однотипных номеров в серии">
            <span className="text-slate-500">Номеров:</span>
            <span className="font-mono font-bold text-purple-400">
              {completedExercisesCount} / {lesson.normReps}
            </span>
          </div>
        </div>

        {/* MIDI Индикатор */}
        <div 
          className="hidden 2xl:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400"
          title={midiInputsCount > 0 ? "MIDI-клавиатура подключена" : "MIDI-устройства не обнаружены"}
        >
          <span className={`w-2 h-2 rounded-full ${midiInputsCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
          <span>MIDI: {midiInputsCount}</span>
        </div>

        {/* Звук кнопка */}
        <button
          onClick={toggleAudioMaster}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
            audioEnabled
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
          title={audioEnabled ? "Выключить звук" : "Включить звук"}
        >
          {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{audioEnabled ? 'Звук' : 'Без звука'}</span>
        </button>

        {/* Настройки кнопка */}
        <button
          onClick={toggleSettingsDrawer}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
          title="Открыть настройки"
          aria-label="Открыть настройки"
          aria-haspopup="dialog"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
