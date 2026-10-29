import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { AppMode, FilterType, TonalityKey } from '../../../types/music';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { createScoreFromExercise, toMusicXml } from '../../../core/notation/musicXml';
import { RotateCw, Mic, Play, Pause, FileDown } from 'lucide-react';

export const TrainerToolbar: React.FC = () => {
  const {
    currentAppMode,
    setAppMode,
    currentFilter,
    setClefFilter,
    currentTonality,
    changeTonality,
    scoreNoteCount,
    toggleScoreDensity,
    bpm,
    setBpm,
    isContinuousFlow,
    trainerPhase,
    toggleContinuousFlow,
    regenerateExercise,
    activeExerciseNotes
  } = useAppStore();

  const modes: { id: AppMode; label: string; color: string }[] = [
    { id: 'reflex', label: '⚡ 1. Рефлекс', color: 'bg-emerald-500 text-slate-950' },
    { id: 'rhythm', label: '🎵 2. Ритмослоги', color: 'text-amber-300' },
    { id: 'lookahead', label: '👁️ 3. Бегунок (+1)', color: 'text-sky-300' },
    { id: 'photo', label: '📸 4. Фото-память', color: 'text-cyan-300' },
    { id: 'intervals', label: '📐 5. Интервалы', color: 'text-indigo-300' },
    { id: 'gpattern', label: '↰ 6. Буква «Г»', color: 'text-amber-300' },
    { id: 'blind', label: '🖐️ 7. Вслепую', color: 'text-purple-300' },
    { id: 'hanon', label: '💪 8. Ганон & Штрихи', color: 'text-rose-300' }
  ];

  const filters: { id: FilterType; label: string }[] = [
    { id: 'treble', label: '200 упр. (C4-G4)' },
    { id: 'treble_oct2', label: '2-я окт. (C4-D5)' },
    { id: 'bass', label: 'Литовко: Бас' },
    { id: 'both', label: '2 руки' }
  ];

  const handlePreviewSolfege = () => {
    audioEngine.playSequence(activeExerciseNotes.map(n => ({
      freq: n.freq,
      durMultiplier: n.durMultiplier,
      articulation: n.articulation
    })), bpm);
  };

  const handleExportMusicXml = () => {
    try {
      const score = createScoreFromExercise(
        activeExerciseNotes,
        currentTonality,
        'Nota-Re - ' + currentAppMode + ' exercise'
      );
      const xml = toMusicXml(score, { includeFingering: currentAppMode === 'hanon' });
      const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'notare-' + currentAppMode + '.musicxml';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('MusicXML export failed', error);
      window.alert('Не удалось экспортировать упражнение в MusicXML.');
    }
  };

  return (
    <div className="shrink-0 w-full bg-slate-900/90 border border-slate-800/90 rounded-xl px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5">
      {/* 8 Методических режимов */}
      <div className="flex flex-wrap items-center gap-1">
        {modes.map(m => {
          const isActive = currentAppMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setAppMode(m.id)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : `${m.color} hover:bg-slate-800`
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Быстрый выбор диапазона / сборника */}
      <div className="hidden 2xl:flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
        {filters.map(f => {
          const isSelected = currentFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setClefFilter(f.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                isSelected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Управление тональностью, плотностью, темпом и потоком */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={currentTonality}
          onChange={(e) => changeTonality(e.target.value as TonalityKey)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono text-sky-300 cursor-pointer focus:outline-none focus:border-sky-500"
        >
          <option value="C">♮ C-dur / a-moll (0 зн.)</option>
          <option value="G">♯ G-dur / e-moll (Фа♯)</option>
          <option value="F">♭ F-dur / d-moll (Си♭)</option>
          <option value="D">♯♯ D-dur / h-moll (Фа♯, До♯)</option>
        </select>

        <button
          onClick={toggleScoreDensity}
          className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 hover:border-slate-700 transition"
        >
          📏 {scoreNoteCount} нот
        </button>

        {/* Метроном темпа */}
        <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
          <span className={`w-2 h-2 rounded-full ${isContinuousFlow ? 'bg-amber-400 animate-ping' : 'bg-slate-700'}`}></span>
          <span className="font-mono text-xs font-bold text-amber-400 w-6 text-right">{bpm}</span>
          <input
            type="range"
            min={40}
            max={130}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-14 accent-emerald-500 cursor-pointer"
          />
        </div>

        {/* Поток автоход */}
        <button
          onClick={toggleContinuousFlow}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
            isContinuousFlow
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
          }`}
        >
          {isContinuousFlow ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          <span>{isContinuousFlow && trainerPhase === 'playing' ? 'Поток: ИДЁТ' : isContinuousFlow ? 'Поток: готов' : 'Поток: Пауза'}</span>
        </button>

        {/* Вокальный образец (Сольфеджио) */}
        <button
          onClick={handlePreviewSolfege}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium transition"
          title="Слуховое предслышание: прослушать мелодию голосом"
        >
          <Mic className="w-3 h-3" />
          <span>Петь</span>
        </button>

        {/* MusicXML boundary: useful independently and ready for OSMD migration. */}
        <button
          onClick={handleExportMusicXml}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-sky-200"
          title="Скачать текущие ноты в формате MusicXML"
        >
          <FileDown className="w-3 h-3" />
          <span>MusicXML</span>
        </button>

        {/* Сгенерировать новый номер */}
        <button
          onClick={regenerateExercise}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-white transition"
          title="Сгенерировать новое упражнение"
        >
          <RotateCw className="w-3 h-3" />
          <span>Новый</span>
        </button>
      </div>
    </div>
  );
};
