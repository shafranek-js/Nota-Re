import React, { useEffect } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { WHITE_KEYS_ORDER, BLACK_KEYS_ORDER, MIDI_NOTE_MAP } from '../../../data/notes';
import { TONALITY_CONFIG } from '../../../data/tonalities';

export const PianoKeyboard: React.FC = () => {
  const {
    handleUserTriggerNote,
    lastKeyResult,
    currentTonality,
    showScaleHighlight,
    toggleScaleHighlight,
    isBlindfolded,
    toggleBlindfoldKeys,
    isTabletopMode,
    toggleTabletopMode,
    activeExerciseNotes,
    activeNoteIndex
  } = useAppStore();

  const tonalityCfg = TONALITY_CONFIG[currentTonality] || TONALITY_CONFIG['C'];
  const totalWhite = WHITE_KEYS_ORDER.length;
  const blackWidthPct = (0.62 / totalWhite) * 100;

  // Обработка клавиш ПК (Z-M для баса, Q-[ для скрипичного, цифры для знаков, пробел для шага)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем ввод, если фокус в input/select/textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'select' || targetTag === 'textarea') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        // В режиме стола или обычном — нажать целевую ноту
        const target = activeExerciseNotes[activeNoteIndex];
        if (target) {
          handleUserTriggerNote(target.noteName);
        }
        return;
      }

      const keyLower = e.key.toLowerCase();
      for (const [noteName, data] of Object.entries(MIDI_NOTE_MAP)) {
        if (data.pcKey && data.pcKey.toLowerCase() === keyLower) {
          e.preventDefault();
          handleUserTriggerNote(noteName);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUserTriggerNote, activeExerciseNotes, activeNoteIndex]);

  return (
    <div className={`shrink-0 w-full bg-slate-900/95 border border-slate-800/90 rounded-2xl p-2 flex flex-col gap-1.5 shadow-xl ${isBlindfolded ? 'blind-mode' : ''}`}>
      {/* Верхняя строка управления клавиатурой */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <span>🎹</span> Полноразмерная дека (3 октавы: C3 – B5)
          </span>
          <span className="text-[11px] font-mono text-slate-400 hidden lg:inline">
            Вслепую: <strong>группы из 2 и 3 чёрных клавиш</strong> • ПК: <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300">Z–M</kbd> (Бас), <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300">Q–P</kbd> (1–2 окт.), <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300">Пробел</kbd> (Ритм/Шаг)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleScaleHighlight}
            className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-medium transition ${
              showScaleHighlight
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-200'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300'
            }`}
          >
            🎼 Звукоряд тональности
          </button>

          <button
            onClick={toggleBlindfoldKeys}
            className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-medium transition ${
              isBlindfolded
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            🙈 Тактильная ширма (18:20)
          </button>

          <button
            onClick={toggleTabletopMode}
            className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-medium transition ${
              isTabletopMode
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            𝪑 Режим «Стол» (22:05)
          </button>
        </div>
      </div>

      {/* Сами клавиши */}
      <div className="w-full overflow-hidden">
        <div className="relative w-full h-[132px] flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <div className="relative w-full h-full flex">
            {/* Белые клавиши */}
            {WHITE_KEYS_ORDER.map(noteName => {
              const info = MIDI_NOTE_MAP[noteName];
              const isC = noteName.startsWith('C');
              const pitchClass = noteName.slice(0, -1);
              const isScaleHint = showScaleHighlight && tonalityCfg.scaleNotes.includes(pitchClass);
              const isLastKey = lastKeyResult?.noteName === noteName;
              const flashClass = isLastKey 
                ? (lastKeyResult.isCorrect ? 'key-active' : 'key-error') 
                : '';

              return (
                <button
                  key={noteName}
                  onClick={() => handleUserTriggerNote(noteName)}
                  className={`piano-white-key flex-1 h-full bg-slate-100 hover:bg-white border-r border-slate-300 last:border-r-0 first:rounded-l-lg last:rounded-r-lg flex flex-col justify-end items-center pb-2 relative z-10 cursor-pointer ${
                    isScaleHint ? 'key-scale-hint' : ''
                  } ${flashClass}`}
                >
                  <span className="text-[10px] font-mono text-slate-400 uppercase mb-0.5">
                    {info.pcKey || ''}
                  </span>
                  <span className={`text-xs font-bold ${isC ? 'text-emerald-700 bg-emerald-100 px-1 rounded' : 'text-slate-800'}`}>
                    {noteName}
                  </span>
                </button>
              );
            })}

            {/* Черные клавиши */}
            {BLACK_KEYS_ORDER.map(noteName => {
              const info = MIDI_NOTE_MAP[noteName];
              const pitchClass = noteName.slice(0, -1);
              const isScaleHint = showScaleHighlight && tonalityCfg.scaleNotes.includes(pitchClass);
              const leftPct = (((info.whiteIdx || 0) + 1 - 0.31) / totalWhite) * 100;
              const isLastKey = lastKeyResult?.noteName === noteName;
              const flashClass = isLastKey 
                ? (lastKeyResult.isCorrect ? 'key-active' : 'key-error') 
                : '';

              return (
                <button
                  key={noteName}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUserTriggerNote(noteName);
                  }}
                  style={{
                    left: `${leftPct}%`,
                    width: `${blackWidthPct}%`
                  }}
                  className={`piano-black-key absolute top-0 h-[62%] rounded-b-lg z-20 flex flex-col justify-end items-center pb-1.5 cursor-pointer ${
                    isScaleHint ? 'key-scale-hint' : ''
                  } ${flashClass}`}
                >
                  <span className="text-[9px] font-mono text-slate-400">
                    {info.pcKey || ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Оверлей режима «Стол» */}
          {isTabletopMode && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md rounded-xl flex flex-col items-center justify-center p-3 text-center z-30 border border-amber-500/40">
              <p className="text-sm font-bold text-amber-300 mb-0.5">
                𝪑 Тренировка за столом: Внутреннее видение клавиатуры (таймкод 22:05)
              </p>
              <p className="text-xs text-slate-300 max-w-2xl mb-2">
                Положите руки на стол. Глядя только в нотный стан, отстукивайте пальцами по столу и чётко визуализируйте в воображении рельеф чёрных и белых клавиш.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const target = activeExerciseNotes[activeNoteIndex];
                    if (target) handleUserTriggerNote(target.noteName);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition"
                >
                  👆 Представил клавишу и нажал на столе (Пробел)
                </button>
                <button
                  onClick={toggleTabletopMode}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Вернуть клавиатуру
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
