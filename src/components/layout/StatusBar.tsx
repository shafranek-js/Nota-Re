import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { audioEngine } from '../../core/audio/AudioEngine';
import { BUILD_DETAILS } from '../../core/release/buildInfo';
import { COURSE_CURRICULUM } from '../../data/curriculum';
import type { ScoreRenderer } from '../../core/notation/scoreRendererPreference';

interface StatusBarProps {
  renderer: ScoreRenderer;
}

const MODE_LABELS: Record<string, string> = {
  reflex: 'Рефлекс', rhythm: 'Ритмослоги', lookahead: 'Бегунок',
  photo: 'Фото', intervals: 'Интервалы', gpattern: 'Буква Г',
  blind: 'Вслепую', hanon: 'Ганон'
};

export const StatusBar: React.FC<StatusBarProps> = ({ renderer }) => {
  const {
    midiInputsCount, audioEnabled, currentWorkspace, activeLessonId,
    currentAppMode, currentTonality, bpm, isTwoHandPracticeOpen,
    selectedLessonId, totalAttempts, correctHits, currentStreak, bestStreak,
    reactionTimes, completedExercisesCount, isRepertoirePreviewOpen
  } = useAppStore();
  const [soundStatus, setSoundStatus] = useState(() => audioEngine.getSoundFontStatus());
  const accuracy = totalAttempts > 0 ? Math.round(100 * correctHits / totalAttempts) : null;
  const recentReactions = reactionTimes.slice(-15);
  const avgReaction = recentReactions.length
    ? Math.round(recentReactions.reduce((sum, ms) => sum + ms, 0) / recentReactions.length)
    : null;
  const lesson = COURSE_CURRICULUM.find(item => item.id === selectedLessonId);

  // SoundFont load/error/output updates can occur without any Zustand change.
  useEffect(() => audioEngine.subscribeSoundFont(setSoundStatus), []);

  const audioLabel = !audioEnabled ? 'Выкл' :
    soundStatus.output === 'oscillator' ? 'Synth' :
    soundStatus.phase === 'ready' ? 'SoundFont: готов' :
    soundStatus.phase === 'loading' ? 'SoundFont: загрузка' :
    soundStatus.phase === 'error' ? 'SoundFont: ошибка' :
    'SoundFont: ожидание';
  const audioTitle = !audioEnabled ? 'Звук отключён' :
    soundStatus.output === 'oscillator' ? 'Встроенный синтезатор Web Audio' :
    soundStatus.phase === 'error'
      ? `Ошибка SoundFont, используется резервный синтезатор: ${soundStatus.error ?? 'неизвестная ошибка'}`
      : `SoundFont: ${soundStatus.bankName}, состояние: ${soundStatus.phase}`;

  return (
    <footer
      data-testid="status-bar"
      aria-label="Строка технического состояния"
      className="w-full shrink-0 h-8 min-w-0 flex items-center border-t border-slate-800 bg-slate-950/95 px-2 sm:px-3 text-[11px] text-slate-400"
    >
      <div className="flex flex-1 min-w-0 h-full items-center gap-3 overflow-x-auto whitespace-nowrap custom-scroll">
        <span data-testid="status-midi" title={midiInputsCount > 0 ? 'Подключённые MIDI-входы' : 'Нет доступных MIDI-входов'}>
          <span aria-hidden="true" className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${midiInputsCount > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          MIDI: <span className={midiInputsCount > 0 ? 'text-emerald-300' : 'text-slate-300'}>{midiInputsCount}</span>
        </span>
        <span data-testid="status-audio" title={audioTitle}>
          Аудио: <span className={soundStatus.phase === 'error' && audioEnabled && soundStatus.output === 'soundfont' ? 'text-amber-300' : 'text-slate-200'}>{audioLabel}</span>
        </span>
        <span title={soundStatus.bankName}>
          Банк: <span className="text-slate-300">{soundStatus.source === 'builtin' ? 'Встроенный' : 'Свой'}</span>
        </span>
        <span data-testid="status-renderer" title="Текущий движок отображения нот">
          Ноты: <span className="text-slate-300">{isRepertoirePreviewOpen ? 'OSMD' : renderer === 'osmd' ? 'OSMD' : 'SVG'}</span>
        </span>
        {currentWorkspace === 'trainer' && isRepertoirePreviewOpen ? (
          <span data-testid="repertoire-status" className="font-semibold text-sky-300">
            Репертуар · только просмотр · без зачёта
          </span>
        ) : (
          <>
        {currentWorkspace === 'trainer' && (
          <>
            <span title={isTwoHandPracticeOpen ? 'Двухручная практика без зачёта' : activeLessonId === null ? 'Свободная практика без урока' : 'Урок курса'}>
              {isTwoHandPracticeOpen ? 'Две руки · без зачёта' : activeLessonId === null ? 'Студия' : `Урок ${activeLessonId}`}
            </span>
            <span title="Режим, тональность и темп">
              {MODE_LABELS[currentAppMode] ?? currentAppMode} · {currentTonality} · {bpm} BPM
            </span>
          </>
        )}
        <span title="Точность попаданий в текущей сессии">
              Точность: <span className="text-slate-300">{accuracy === null ? '—' : `${accuracy}%`} ({totalAttempts})</span>
            </span>
            <span title="Текущая и лучшая серия верных нот">
              Серия: <span className="text-slate-300">{currentStreak} / рек. {bestStreak}</span>
            </span>
            <span title="Средний отклик по последним 15 верным ответам">
              Отклик: <span className="text-slate-300">{avgReaction === null ? '—' : `${avgReaction} мс`}</span>
            </span>
            <span title="Сыграно однотипных номеров в серии">
              Номеров: <span className="text-slate-300">{completedExercisesCount} / {activeLessonId !== null && lesson ? lesson.normReps : '—'}</span>
            </span>
          </>
        )}
      </div>
      <span
        data-testid="build-version"
        title="Версия, ревизия Git и тип сборки"
        className="ml-2 shrink-0 whitespace-nowrap border-l border-slate-800 pl-2 font-mono tabular-nums text-sky-300"
      >
        {BUILD_DETAILS}
      </span>
    </footer>
  );
};
