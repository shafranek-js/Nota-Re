import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { computeIntervalInfo } from '../../../core/generator/ExerciseGenerator';

export const TargetInfoBar: React.FC = () => {
  const {
    activeExerciseNotes,
    activeNoteIndex,
    lastTriggeredNote,
    currentAppMode
  } = useAppStore();

  const target = activeExerciseNotes[activeNoteIndex];
  const prevNote = activeNoteIndex > 0 ? activeExerciseNotes[activeNoteIndex - 1] : null;
  const intervalInfo = computeIntervalInfo(prevNote, target);

  const tips: Record<string, string> = {
    reflex: 'Вижу знак на линейке ➔ палец сразу жмёт клавишу. Запретите себе называть ноту в уме!',
    rhythm: 'Произносите вслух ритмослоги: «ТА», «ТИ-ТИ», «ТИ-РИ-ТИ-РИ». Счёт «раз-и-два-и» запрещён!',
    lookahead: 'Глаза на 1 шаг впереди рук! Смотрите в следующую ноту ещё до того, как палец отпустит текущую.',
    photo: 'Схватите 4 ноты такта одним зрительным снимком до появления маски. Играйте по памяти!',
    intervals: 'Считывайте дистанцию: одинаковые линейки — через палец, линия в окошко — соседний палец.',
    gpattern: 'Траектория буквы «Г»: бас на 1-ю долю (левая рука) ➔ глаза скользят вверх и вправо по мелодии.',
    blind: 'Не смотрите на клавиатуру! Ощупывайте рельеф по островкам из 2 и 3 чёрных клавиш.',
    hanon: 'Чёткий посыл в кончики 4-го и 5-го пальцев. Совмещайте стаккато в левой руке с легато в правой!'
  };

  return (
    <div className="shrink-0 w-full flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
          ЦЕЛЬ: <strong className="text-sky-400 font-mono">{target?.noteName || '—'}</strong>
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
          ИНТЕРВАЛ: <strong className="text-indigo-400 font-mono">{intervalInfo.name}</strong>
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
          РИТМОСЛОГ: <strong className="text-amber-400 font-mono">{target?.syllable || 'ТА'}</strong>
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
          ПАЛЕЦ / ШТРИХ: <strong className="text-rose-400 font-mono">{target?.finger || 1} • {target?.articulation || 'legato'}</strong>
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
          ОТВЕТ: <strong className="text-slate-300 font-mono">{lastTriggeredNote || '—'}</strong>
        </span>
      </div>

      <div className="text-slate-400 text-xs truncate max-w-2xl">
        💡 <strong className="text-emerald-400">Методика:</strong> {tips[currentAppMode] || tips.reflex}
      </div>
    </div>
  );
};
