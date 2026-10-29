import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { COURSE_CURRICULUM } from '../../../data/curriculum';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export const TrainerBanner: React.FC = () => {
  const {
    selectedLessonId,
    activeLessonId,
    completedLessons,
    completedExercisesCount,
    switchWorkspace,
    goToNextLessonAndStart
  } = useAppStore();

  const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
  const isDone = completedLessons.includes(lesson.id);

  return (
    <div data-testid="trainer-banner" className="shrink-0 w-full bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 text-xs">
        <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[11px]">
          УРОК {lesson.id} / 12
        </span>
        <strong className="text-white truncate max-w-md">
          {lesson.title}
        </strong>
        <span data-testid="course-credit-mode" className={activeLessonId === lesson.id
          ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
          {activeLessonId === lesson.id ? 'Зачётная попытка' : 'Практика без зачёта'}
        </span>
        <span className="hidden lg:inline text-slate-400">
          • Норматив: {lesson.normReps} ном. (точность ≥{lesson.normAcc}%, отклик &lt;{lesson.normSpeed} мс)
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2 bg-slate-950/90 px-2.5 py-1 rounded-lg border border-slate-800 font-mono text-[11px]">
          <span className="text-slate-400">Зачёт серии:</span>
          <strong className="text-purple-400">{completedExercisesCount} / {lesson.normReps} ном.</strong>
          <span className="text-slate-700">|</span>
          {isDone ? (
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle2 className="w-3 h-3" /> ЗАЧЁТ СДАН!
            </span>
          ) : (
            <span className="text-amber-400">В процессе...</span>
          )}
        </div>

        <button
          onClick={() => switchWorkspace('course')}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
        >
          🎓 К карте курса
        </button>

        {isDone && (
          <button
            onClick={goToNextLessonAndStart}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] shadow transition"
          >
            <span>🎉 Зачёт сдан! Следующий урок</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
