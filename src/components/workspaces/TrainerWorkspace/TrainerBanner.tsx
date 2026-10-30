import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { COURSE_CURRICULUM } from '../../../data/curriculum';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export const TrainerBanner: React.FC = () => {
  const {
    selectedLessonId,
    activeLessonId,
    completedLessons,
    courseWindows,
    switchWorkspace,
    goToNextLessonAndStart,
    startActiveLessonInTrainer,
    trainerPhase, speedChallengeTargetMs, exitSpeedChallenge
  } = useAppStore();

  const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
  const isDone = completedLessons.includes(lesson.id);
  const isAssessmentActive = activeLessonId === lesson.id &&
    (trainerPhase === 'playing' || trainerPhase === 'countIn');

  return (
    <div data-testid="trainer-banner" className="shrink-0 w-full min-w-0 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-xl px-3 py-1.5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-1.5">
      <div className="flex min-w-0 w-full xl:w-auto flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[11px]">
          УРОК {lesson.id} / 12
        </span>
        <strong data-testid="trainer-lesson-title" title={lesson.title}
          className="min-w-0 max-w-full whitespace-normal break-words leading-snug text-white sm:max-w-md">
          {lesson.title}
        </strong>
        <span data-testid="course-credit-mode" className={isAssessmentActive
          ? 'shrink-0 text-emerald-300 font-semibold' : 'shrink-0 text-amber-300 font-semibold'}>
          {isAssessmentActive ? 'Зачётная попытка' : 'Практика без зачёта'}
        </span>
        <span className="hidden lg:inline text-slate-400">
          • Норматив: {lesson.normReps} ном., точность ≥{lesson.normAcc}%
           · скорость отдельно
        </span>
        {speedChallengeTargetMs !== null && (
          <span data-testid="speed-check-active" className="text-sky-200 font-semibold">
            Проверка скорости ≤{speedChallengeTargetMs} мс · без зачёта
          </span>
        )}
      </div>

      <div className="flex min-w-0 w-full xl:w-auto flex-wrap items-center gap-1.5 text-xs">
        {!isAssessmentActive && speedChallengeTargetMs === null && (
          <button type="button" data-testid="studio-start-course" onClick={startActiveLessonInTrainer}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
            Начать зачёт урока {lesson.id}
          </button>
        )}
        <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 bg-slate-950/90 px-2.5 py-1 rounded-lg border border-slate-800 font-mono text-[11px]">
          <span className="text-slate-400">{isAssessmentActive ? 'Зачёт серии:' : 'Сохранено:'}</span>
          <strong className="text-purple-400">{courseWindows[lesson.id]?.length ?? 0} / {lesson.normReps} ном.</strong>
          <span className="text-slate-700">|</span>
          {isDone ? (
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle2 className="w-3 h-3" /> ЗАЧЁТ СДАН!
            </span>
          ) : (
            <span className="text-amber-400">{isAssessmentActive ? 'В процессе...' : 'Не начат'}</span>
          )}
        </div>

        {speedChallengeTargetMs !== null && (
          <button type="button" onClick={exitSpeedChallenge}
            className="px-2.5 py-1 rounded-lg border border-sky-700 text-sky-200 text-[11px]">
            Закончить проверку
          </button>
        )}
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
