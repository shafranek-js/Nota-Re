import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { TONALITY_CONFIG } from '../../../data/tonalities';
import { audioEngine } from '../../../core/audio/AudioEngine';
import { Camera, Volume2 } from 'lucide-react';

export const GrandStaffSvg: React.FC = () => {
  const {
    activeExerciseNotes,
    activeNoteIndex,
    currentAppMode,
    currentFilter,
    currentTonality,
    showBassLandmarks,
    toggleBassLandmarks,
    triggerPhotoFlash,
    isPhotoMasked,
    speechSuppressor,
    cycleSpeechSuppressor,
    bpm
  } = useAppStore();

  const tonalityCfg = TONALITY_CONFIG[currentTonality] || TONALITY_CONFIG['C'];
  const startX = 155;
  const endX = 1650;
  const availableWidth = endX - startX;
  const spacingX = availableWidth / Math.max(1, activeExerciseNotes.length - 1);

  // Расчет шторки бегунка (+1)
  const activeX = startX + activeNoteIndex * spacingX;
  const curtainWidth = currentAppMode === 'lookahead' ? Math.max(0, activeX - 125 + 24) : 0;

  // Расчет фото-маски такта
  const currentBar = Math.floor(activeNoteIndex / 4);
  const photoMaskX = startX + (currentBar * 4) * spacingX - 25;
  const photoMaskWidth = spacingX * 3.7 + 50;

  const speechLabels: Record<string, string> = {
    count: 'Счёт вслух (1-2-3-4)',
    tata: 'Слог: ТА-ТА-ТА-ТА',
    syllables: 'Ритмослоги Фроловой',
    solfege: 'Пение высоты (Фридкин)'
  };

  const collectionNames: Record<string, string> = {
    treble: '200 упр. (C4–G4)',
    treble_oct2: 'Вторая октава (C4–D5)',
    bass: 'М. Литовко (Бас C3–B3)',
    both: 'Две руки (Буква «Г»)'
  };

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-900/65 border border-slate-800/90 rounded-2xl relative flex flex-col justify-between p-2.5 overflow-hidden shadow-inner">
      {/* Верхняя инфо-полоса нотного стана */}
      <div className="shrink-0 w-full flex flex-wrap items-center justify-between gap-2 z-10 border-b border-slate-800/60 pb-1.5">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="flex items-center gap-1.5 font-mono text-slate-300 bg-slate-950/90 px-2.5 py-0.5 rounded-md border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
            Такт: <strong className="text-white">{Math.floor(activeNoteIndex / 4) + 1} / {Math.max(1, Math.ceil(activeExerciseNotes.length / 4))}</strong>
          </span>
          <span className="text-slate-400">
            Сборник: <strong className="text-sky-400">{collectionNames[currentFilter]}</strong>
          </span>
          <span className="hidden md:inline text-slate-600">•</span>
          <span className="hidden md:inline text-slate-400">
            Фокус: <strong className="text-emerald-400">Прямой рефлекс «Вижу знак → нажимаю клавишу»</strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleBassLandmarks}
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition ${
              showBassLandmarks
                ? 'bg-purple-500/20 border border-purple-500/50 text-purple-200'
                : 'bg-slate-950/90 border border-slate-800 hover:border-purple-500/40 text-purple-300'
            }`}
          >
            𝄢 Маяки баса: {showBassLandmarks ? 'ВКЛ (Фа3 / Соль2)' : 'ВЫКЛ'}
          </button>

          {currentAppMode === 'photo' && (
            <button
              onClick={triggerPhotoFlash}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/30 transition"
            >
              <Camera className="w-3 h-3" />
              <span>Вспышка такта</span>
            </button>
          )}

          <button
            onClick={() => audioEngine.playSyllablePatternDemo('titi', bpm)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-800 hover:border-amber-500/40 text-[11px] font-mono text-amber-300 transition"
          >
            <Volume2 className="w-3 h-3" />
            <span>Ритм-образец</span>
          </button>

          <button
            onClick={cycleSpeechSuppressor}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-800 hover:border-amber-500/40 text-[11px] transition"
            title="Нажмите для смены режима глушителя"
          >
            <span className="text-amber-400">🗣 Речь:</span>
            <span className="font-mono font-bold text-amber-300">
              {speechLabels[speechSuppressor]}
            </span>
          </button>
        </div>
      </div>

      {/* SVG Панорамный Гранд-Стан во всю ширину экрана */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center relative my-0.5">
        <svg 
          viewBox="0 0 1720 305" 
          preserveAspectRatio="none" 
          className="w-full h-full max-h-[370px] select-none"
        >
          <defs>
            <linearGradient id="curtainGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#060a12" stopOpacity="0.97"/>
              <stop offset="92%" stopColor="#0f172a" stopOpacity="0.94"/>
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.45"/>
            </linearGradient>
            <linearGradient id="photoMaskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#082f49" stopOpacity="0.96"/>
              <stop offset="100%" stopColor="#020617" stopOpacity="0.98"/>
            </linearGradient>
          </defs>

          {/* Фон нотных линеек */}
          <rect x="20" y="34" width="1680" height="84" rx="6" fill="#0f172a" opacity="0.35"/>
          <rect x="20" y="164" width="1680" height="84" rx="6" fill="#0f172a" opacity="0.35"/>

          {/* 5 линеек скрипичного ключа */}
          <g stroke="#334155" strokeWidth="1.6">
            <line x1="25" y1="40" x2="1695" y2="40"/>
            <line x1="25" y1="58" x2="1695" y2="58"/>
            <line x1="25" y1="76" x2="1695" y2="76"/>
            <line x1="25" y1="94" x2="1695" y2="94"/>
            <line x1="25" y1="112" x2="1695" y2="112"/>
          </g>

          {/* 5 линеек басового ключа */}
          <g stroke="#334155" strokeWidth="1.6">
            <line x1="25" y1="170" x2="1695" y2="170"/>
            <line x1="25" y1="188" x2="1695" y2="188"/>
            <line x1="25" y1="206" x2="1695" y2="206"/>
            <line x1="25" y1="224" x2="1695" y2="224"/>
            <line x1="25" y1="242" x2="1695" y2="242"/>
          </g>

          {/* Акколада и ключи */}
          <line x1="25" y1="40" x2="25" y2="242" stroke="#94a3b8" strokeWidth="3.5"/>
          <text x="34" y="102" fill="#38bdf8" fontSize="72" fontFamily="serif">𝄞</text>
          <text x="34" y="226" fill="#a855f7" fontSize="60" fontFamily="serif">𝄢</text>

          {/* Ключевые знаки тональности */}
          <g id="key-signature-layer">
            {tonalityCfg.signs.map((s, idx) => {
              const xPos = 80 + idx * 14;
              return (
                <g key={idx}>
                  <text x={xPos} y={s.trebleY} fill="#38bdf8" fontSize="22" fontWeight="bold">
                    {s.type}
                  </text>
                  <text x={xPos} y={s.bassY} fill="#a855f7" fontSize="22" fontWeight="bold">
                    {s.type}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Маяки басового ключа (Литовко) */}
          {showBassLandmarks && (
            <g id="bass-landmarks-layer">
              <line x1="25" y1="188" x2="1695" y2="188" stroke="#a855f7" strokeWidth="2.2" strokeDasharray="6 4" opacity="0.6"/>
              <text x="1685" y="184" textAnchor="end" fill="#c084fc" fontSize="11" fontFamily="JetBrains Mono" fontWeight="bold">
                Маяк Фа (F3 — 4-я лин.)
              </text>
              <line x1="25" y1="242" x2="1695" y2="242" stroke="#818cf8" strokeWidth="2.2" strokeDasharray="6 4" opacity="0.5"/>
              <text x="1685" y="238" textAnchor="end" fill="#818cf8" fontSize="11" fontFamily="JetBrains Mono" fontWeight="bold">
                Маяк Соль (G2 — 1-я лин.)
              </text>
            </g>
          )}

          {/* Размер 4/4 */}
          <g fill="#64748b" fontFamily="serif" fontWeight="bold" fontSize="24" textAnchor="middle">
            <text x="112" y="68">4</text>
            <text x="112" y="102">4</text>
            <text x="112" y="198">4</text>
            <text x="112" y="232">4</text>
          </g>

          {/* Финальная двойная тактовая черта */}
          <line x1="1695" y1="40" x2="1695" y2="242" stroke="#94a3b8" strokeWidth="4"/>
          <line x1="1688" y1="40" x2="1688" y2="242" stroke="#64748b" strokeWidth="1.5"/>

          {/* Скобки блоков Ганона / Фото-памяти */}
          {(currentAppMode === 'hanon' || currentAppMode === 'photo') && (
            <g id="blocks-brackets-layer">
              {Array.from({ length: Math.ceil(activeExerciseNotes.length / 4) }).map((_, g) => {
                const x1 = startX + (g * 4) * spacingX - 16;
                const x2 = startX + Math.min(activeExerciseNotes.length - 1, g * 4 + 3) * spacingX + 16;
                const color = currentAppMode === 'photo' ? '#22d3ee' : '#f43f5e';
                return (
                  <g key={g}>
                    <path
                      d={`M ${x1} 26 L ${x1} 18 L ${x2} 18 L ${x2} 26`}
                      stroke={color}
                      strokeWidth="1.8"
                      fill="none"
                      opacity="0.75"
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y="13"
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="JetBrains Mono"
                      fill={currentAppMode === 'photo' ? '#67e8f9' : '#fb7185'}
                    >
                      {currentAppMode === 'photo' ? `ФОТО-ТАКТ #${g + 1}` : `БЛОК #${g + 1}`}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Слой нот и элементов партитуры */}
          <g id="staff-notes-layer">
            {activeExerciseNotes.map((n, idx) => {
              const cx = startX + idx * spacingX;
              const cy = n.y;

              let fill = '#e2e8f0';
              if (n.status === 'current') fill = '#f59e0b';
              else if (n.status === 'done') fill = '#10b981';
              else if (n.status === 'missed') fill = '#f43f5e';

              const isHalfNote = n.durMultiplier === 2;
              const stemUp = cy >= 76;
              const stemX = stemUp ? cx + 9.5 : cx - 9.5;
              const stemY2 = stemUp ? cy - 38 : cy + 38;

              return (
                <g key={idx}>
                  {/* Тактовая черта перед тактом */}
                  {idx > 0 && idx % 4 === 0 && (
                    <g>
                      <line
                        x1={cx - spacingX / 2}
                        y1="40"
                        x2={cx - spacingX / 2}
                        y2="242"
                        stroke="#475569"
                        strokeWidth="1.6"
                      />
                      <text
                        x={cx - spacingX / 2 + 6}
                        y="33"
                        fontSize="11"
                        fontFamily="JetBrains Mono"
                        fill="#64748b"
                      >
                        Такт {idx / 4 + 1}
                      </text>
                    </g>
                  )}

                  {/* Интервальные дуги в режиме Интервалы */}
                  {currentAppMode === 'intervals' && idx > 0 && (() => {
                    const prev = activeExerciseNotes[idx - 1];
                    const px = startX + (idx - 1) * spacingX;
                    const py = prev.y;
                    const stepDiff = Math.abs(n.stepIdx - prev.stepIdx);
                    const isSymmetric = stepDiff % 2 === 0;
                    const midX = (px + cx) / 2;
                    const midY = Math.min(py, cy) - 24;

                    return (
                      <g>
                        <path
                          d={`M ${px} ${py - 8} Q ${midX} ${midY} ${cx} ${cy - 8}`}
                          fill="none"
                          stroke={isSymmetric ? '#818cf8' : '#34d399'}
                          strokeWidth="1.8"
                          strokeDasharray={isSymmetric ? 'none' : '3 2'}
                        />
                        <text
                          x={midX}
                          y={midY - 2}
                          textAnchor="middle"
                          fontSize="10"
                          fontFamily="JetBrains Mono"
                          fill={isSymmetric ? '#a5b4fc' : '#6ee7b7'}
                        >
                          {stepDiff + 1}-я ({isSymmetric ? 'симметр.' : 'лин-окошко'})
                        </text>
                      </g>
                    );
                  })()}

                  {/* Буква Г траектория */}
                  {(currentAppMode === 'gpattern' || currentFilter === 'both') && 
                   idx % 4 === 0 && 
                   idx + 1 < activeExerciseNotes.length && (() => {
                    const nextNote = activeExerciseNotes[idx + 1];
                    const nx = startX + (idx + 1) * spacingX;
                    return (
                      <g>
                        <path
                          d={`M ${cx} ${cy - 14} L ${cx} ${nextNote.y} L ${nx - 14} ${nextNote.y}`}
                          stroke="#f59e0b"
                          strokeWidth="2.2"
                          strokeDasharray="5 3"
                          fill="none"
                        />
                        <text
                          x={cx - 10}
                          y={nextNote.y - 8}
                          fill="#fbbf24"
                          fontSize="11"
                          fontWeight="bold"
                        >
                          Г ➔
                        </text>
                      </g>
                    );
                  })()}

                  {/* Добавочные линейки */}
                  {n.ledger && (
                    <line
                      x1={cx - 18}
                      y1={n.ledger}
                      x2={cx + 18}
                      y2={n.ledger}
                      stroke="#94a3b8"
                      strokeWidth="2.2"
                    />
                  )}

                  {/* Пульсирующий ореол активной ноты */}
                  {n.status === 'current' && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="19"
                      fill="rgba(245, 158, 11, 0.14)"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Случайный знак альтерации */}
                  {n.accidental && (
                    <text
                      x={cx - 23}
                      y={cy + 6}
                      fill={n.accidental === 'sharp' ? '#38bdf8' : '#fbbf24'}
                      fontSize="20"
                      fontWeight="bold"
                    >
                      {n.accidental === 'sharp' ? '♯' : '♭'}
                    </text>
                  )}

                  {/* Головка ноты */}
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx="10.5"
                    ry="7.5"
                    transform={`rotate(-18 ${cx} ${cy})`}
                    fill={isHalfNote ? '#060a12' : fill}
                    stroke={fill}
                    strokeWidth={isHalfNote ? '3' : '1'}
                  />

                  {/* Точка стаккато */}
                  {n.articulation === 'staccato' && (
                    <circle
                      cx={cx}
                      cy={cy + 19}
                      r="3.2"
                      fill="#fb7185"
                    />
                  )}

                  {/* Штиль */}
                  <line
                    x1={stemX}
                    y1={cy}
                    x2={stemX}
                    y2={stemY2}
                    stroke={fill}
                    strokeWidth="2.2"
                  />

                  {/* Флажок для восьмых (dur <= 0.5) */}
                  {n.durMultiplier <= 0.5 && (
                    <path
                      d={stemUp
                        ? `M ${stemX} ${stemY2} Q ${stemX + 12} ${stemY2 + 7} ${stemX + 9} ${stemY2 + 17}`
                        : `M ${stemX} ${stemY2} Q ${stemX + 12} ${stemY2 - 7} ${stemX + 9} ${stemY2 - 17}`}
                      stroke={fill}
                      strokeWidth="2.4"
                      fill="none"
                    />
                  )}

                  {/* Второй флажок для шестнадцатых (dur === 0.25) */}
                  {n.durMultiplier === 0.25 && (
                    <path
                      d={stemUp
                        ? `M ${stemX} ${stemY2 + 9} Q ${stemX + 12} ${stemY2 + 16} ${stemX + 9} ${stemY2 + 26}`
                        : `M ${stemX} ${stemY2 - 9} Q ${stemX + 12} ${stemY2 - 16} ${stemX + 9} ${stemY2 - 26}`}
                      stroke={fill}
                      strokeWidth="2.4"
                      fill="none"
                    />
                  )}

                  {/* Номер пальца (аппликатура) */}
                  {(currentAppMode === 'hanon' || n.finger >= 4) && (
                    <text
                      x={cx}
                      y={cy - 44}
                      textAnchor="middle"
                      fontSize="12"
                      fontFamily="JetBrains Mono"
                      fontWeight="bold"
                      fill={n.finger >= 4 ? '#fb7185' : '#94a3b8'}
                    >
                      {n.finger}
                    </text>
                  )}

                  {/* Ритмослог / Текст под нотой */}
                  <text
                    x={cx}
                    y="274"
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="JetBrains Mono"
                    fontWeight={n.status === 'current' ? 'bold' : 'normal'}
                    fill={n.status === 'current' ? '#38bdf8' : '#64748b'}
                  >
                    {n.syllable}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Шторка бегунка (+1) */}
          {currentAppMode === 'lookahead' && curtainWidth > 0 && (
            <g id="svg-curtain-group">
              <rect
                x="125"
                y="15"
                width={curtainWidth}
                height="270"
                rx="6"
                fill="url(#curtainGrad)"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <text
                x="135"
                y="34"
                fill="#38bdf8"
                fontSize="12"
                fontFamily="JetBrains Mono"
                fontWeight="bold"
              >
                БЕГУНОК: СМОТРИТЕ ВПЕРЁД ➔
              </text>
            </g>
          )}

          {/* Фото-маска такта */}
          {currentAppMode === 'photo' && isPhotoMasked && (
            <g id="svg-photo-mask-group">
              <rect
                x={photoMaskX}
                y="18"
                width={photoMaskWidth}
                height="260"
                rx="8"
                fill="url(#photoMaskGrad)"
                stroke="#22d3ee"
                strokeWidth="2"
                strokeDasharray="6 3"
              />
              <text
                x={photoMaskX + photoMaskWidth / 2}
                y="138"
                textAnchor="middle"
                fill="#22d3ee"
                fontSize="14"
                fontFamily="JetBrains Mono"
                fontWeight="bold"
              >
                📸 ТАКТ СФОТОГРАФИРОВАН
              </text>
              <text
                x={photoMaskX + photoMaskWidth / 2}
                y="160"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontFamily="Inter"
              >
                Играйте по зрительной памяти и смотрите в следующий такт!
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
