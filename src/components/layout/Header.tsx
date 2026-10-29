import React from 'react';
import { useAppStore, WorkspaceTab } from '../../store/useAppStore';
import { Settings, Volume2, VolumeX, Music } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentWorkspace,
    switchWorkspace,
    completedLessons,
    audioEnabled,
    toggleAudioMaster,
    toggleSettingsDrawer
  } = useAppStore();

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'course', label: 'Курс' },
    { id: 'trainer', label: 'Студия' },
    { id: 'theory', label: 'База знаний' }
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
            <span className="hidden md:inline text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
              Курс: {completedLessons.length} / 12 уроков
            </span>
          </div>
        </div>
      </div>

      {/* Центральный переключатель рабочих пространств */}
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
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Правый блок: управление звуком и настройками */}
      <div className="flex items-center gap-2 shrink-0">
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
