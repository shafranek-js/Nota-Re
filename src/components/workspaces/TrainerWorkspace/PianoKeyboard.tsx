import React, { useEffect } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { WHITE_KEYS_ORDER, BLACK_KEYS_ORDER, MIDI_NOTE_MAP } from '../../../data/notes';
import { TONALITY_CONFIG } from '../../../data/tonalities';
import { resolveKeyboardLabels } from '../../../core/training/keyboardLabels';

export const PianoKeyboard: React.FC<{ zen?: boolean }> = ({ zen = false }) => {
  const {
    handleUserTriggerNote,
    advanceAssistedStep,
    lastKeyResult,
    currentTonality,
    showScaleHighlight,
    isBlindfolded,
    isTabletopMode,
    toggleTabletopMode,
    keyboardLabelMode,
    midiInputsCount
  } = useAppStore();

  const tonalityCfg = TONALITY_CONFIG[currentTonality] || TONALITY_CONFIG['C'];
  const visibleLabels = resolveKeyboardLabels(keyboardLabelMode);
  const totalWhite = WHITE_KEYS_ORDER.length;
  const blackWidthPct = (0.62 / totalWhite) * 100;

  // Обработка клавиш ПК (Z-M для баса, Q-[ для скрипичного, цифры для знаков, пробел для шага)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Piano shortcuts are global only while the page or piano region has
      // focus. Never steal Space / note letters from normal focused controls:
      // otherwise Space on the "Photo" button silently advances tabletop
      // practice instead of activating the button. A focused piano key is a
      // special case: letters still play notes, while Space activates that
      // exact native button via its regular click handler.
      if (useAppStore.getState().isSettingsOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const isPianoKey = !!target?.closest('.piano-white-key, .piano-black-key');
      if (target?.isContentEditable || (target?.closest(
        'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="link"], [contenteditable]'
      ) && !isPianoKey)) return;

      if (e.code === 'Space') {
        if (isPianoKey) return; // native Space activates the focused piano key
        // Space is a non-scoring imagined step only in tabletop mode.
        // Never guess the right answer in a graded keyboard exercise.
        if (!isTabletopMode || e.repeat) return;
        e.preventDefault();
        advanceAssistedStep();
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
  }, [handleUserTriggerNote, advanceAssistedStep, isTabletopMode]);

  return (
    <div className={`shrink-0 w-full bg-slate-900/95 border border-slate-800/90 rounded-2xl p-2 flex flex-col gap-1.5 shadow-xl ${isBlindfolded ? 'blind-mode' : ''}`}>
      {!zen && <div className="px-1 flex flex-wrap justify-between items-center gap-2">
        <strong className="text-xs text-slate-300">Клавиатура C3–B5</strong>
        <span className="text-[11px] text-slate-500">
          {isTabletopMode ? 'Режим «Стол» · без зачёта' :
            visibleLabels === 'pc' ? 'ПК: Z–M (бас), Q–P (верх)' :
              visibleLabels === 'notes' ? 'Подписи нот' : 'Без подписей'}
          {midiInputsCount > 0 ? ' · MIDI подключён' : ''}
        </span>
      </div>}

      {/* Сами клавиши */}
      <div className="w-full overflow-x-auto custom-scroll" role="region" aria-label="Прокручиваемая клавиатура фортепиано" tabIndex={0}>
        <div className="relative w-full min-w-[560px] h-[132px] flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <div className="relative w-full h-full flex">
            {/* Белые клавиши */}
            {WHITE_KEYS_ORDER.map(noteName => {
              const info = MIDI_NOTE_MAP[noteName];
              const isC = noteName.startsWith('C');
              const pitchClass = noteName.slice(0, -1);
              const isScaleHint = showScaleHighlight && tonalityCfg.scaleNotes.includes(pitchClass);
              const isLastKey = !!lastKeyResult && MIDI_NOTE_MAP[lastKeyResult.noteName]?.midi === info.midi;
              const flashClass = isLastKey 
                ? (lastKeyResult.isCorrect ? 'key-active' : 'key-error') 
                : '';

              return (
                <button
                  key={noteName}
                  aria-label={`Клавиша ${noteName}`}
                  onClick={() => handleUserTriggerNote(noteName)}
                  className={`piano-white-key flex-1 h-full bg-slate-100 hover:bg-white border-r border-slate-300 last:border-r-0 first:rounded-l-lg last:rounded-r-lg flex flex-col justify-end items-center pb-2 relative z-10 cursor-pointer ${
                    isScaleHint ? 'key-scale-hint' : ''
                  } ${flashClass}`}
                >
                  {visibleLabels === 'pc' && !isBlindfolded && (
                    <span className="text-[10px] font-mono text-slate-400 uppercase mb-0.5" aria-hidden="true">
                      {info.pcKey || ''}
                    </span>
                  )}
                  {visibleLabels === 'notes' && !isBlindfolded && (
                    <span className={`text-xs font-bold ${isC ? 'text-emerald-700 bg-emerald-100 px-1 rounded' : 'text-slate-800'}`} aria-hidden="true">
                      {noteName}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Черные клавиши */}
            {BLACK_KEYS_ORDER.map(noteName => {
              const info = MIDI_NOTE_MAP[noteName];
              // The same black key is Bb under F major and A# elsewhere.
              const pitchClass = currentTonality === 'F' && noteName.startsWith('A#')
                ? 'Bb' : noteName.slice(0, -1);
              const isScaleHint = showScaleHighlight && tonalityCfg.scaleNotes.includes(pitchClass);
              const leftPct = (((info.whiteIdx || 0) + 1 - 0.31) / totalWhite) * 100;
              const isLastKey = !!lastKeyResult && MIDI_NOTE_MAP[lastKeyResult.noteName]?.midi === info.midi;
              const flashClass = isLastKey 
                ? (lastKeyResult.isCorrect ? 'key-active' : 'key-error') 
                : '';

              return (
                <button
                  key={noteName}
                  aria-label={`Клавиша ${currentTonality === 'F' && noteName.startsWith('A#')
                    ? 'Bb' + noteName.slice(-1) : noteName}`}
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
                  {visibleLabels === 'pc' && !isBlindfolded && (
                    <span className="text-[9px] font-mono text-slate-400" aria-hidden="true">
                      {info.pcKey || ''}
                    </span>
                  )}
                  {visibleLabels === 'notes' && !isBlindfolded && (
                    <span className="text-[9px] font-mono text-slate-200" aria-hidden="true">
                      {currentTonality === 'F' && noteName.startsWith('A#')
                        ? 'Bb' + noteName.slice(-1) : noteName}
                    </span>
                  )}
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
                  onClick={advanceAssistedStep}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition"
                >
                  Представил клавишу — следующий шаг (без зачёта, Пробел)
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
