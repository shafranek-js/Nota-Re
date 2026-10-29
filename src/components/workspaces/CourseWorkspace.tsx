import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { COURSE_CURRICULUM } from '../../data/curriculum';
import { CheckCircle2, Circle, ArrowLeft, ArrowRight, Play, RotateCcw } from 'lucide-react';

export const CourseWorkspace: React.FC = () => {
  const {
    selectedLessonId,
    selectCourseLesson,
    selectPrevCourseLesson,
    selectNextCourseLesson,
    completedLessons,
    toggleLessonCompleted,
    resetCourseProgress,
    startActiveLessonInTrainer,
    startTwoHandCourseTrial
  } = useAppStore();

  const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
  const isDone = completedLessons.includes(lesson.id);
  const doneCount = completedLessons.length;
  const pct = Math.round((doneCount / COURSE_CURRICULUM.length) * 100);

  return (
    <section className="flex-1 min-h-full lg:min-h-0 w-full p-3 sm:p-3.5 overflow-visible lg:overflow-hidden flex flex-col gap-3">
      {/* Шапка курса */}
      <div className="shrink-0 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
              Методология Nota Re & Ф. Брянская
            </span>
            <span className="text-xs text-slate-400">12 недель • 4 модуля • От 0 до беглости</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            🎓 Программа выработки беглого чтения нот с листа на фортепиано
          </h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Каждый урок настраивает тренажёр на конкретный психологический приём: от отключения внутреннего голоса до опережающего зрения и независимости пальцев. Сдавайте нормативы зачётной серии для перехода к следующему этапу.
          </p>
        </div>

        {/* Общая шкала курса */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 w-full sm:w-auto sm:min-w-[260px] min-w-0 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Общий прогресс курса:</span>
            <span className="font-mono font-bold text-emerald-400">{doneCount} / 12 ({pct}%)</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full rounded-full transition-all duration-300" 
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Старт</span>
            <span>Модуль II</span>
            <span>Модуль III</span>
            <span>Финал</span>
          </div>
        </div>
      </div>

      {/* 2 Колонки: Список 12 уроков (слева) + Карточка выбранного урока (справа) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 lg:flex-1 lg:min-h-0 gap-3.5">
        
        {/* Список 12 уроков */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl p-3 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2.5 border-b border-slate-800 shrink-0">
            <span className="text-xs font-bold uppercase font-mono text-slate-400">Уроки программы (1–12)</span>
            <span className="text-xs text-slate-500 font-mono">Нажмите для выбора</span>
          </div>

          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scroll space-y-2 pr-1 pt-2">
            {COURSE_CURRICULUM.map(item => {
              const isSelected = item.id === selectedLessonId;
              const itemDone = completedLessons.includes(item.id);

              return (
                <button
                  type="button"
                  key={item.id}
                  data-testid={`course-lesson-${item.id}`}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={`Выбрать урок ${item.id}: ${item.title}`}
                  onClick={() => selectCourseLesson(item.id)}
                  className={`w-full text-left p-3 rounded-xl border cursor-pointer transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 flex items-start justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/60 shadow-md shadow-emerald-950/40'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                      itemDone 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.id.toString().padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{item.module}</span>
                        <span className="text-[10px] text-slate-500">• {item.timecode}</span>
                      </div>
                      <h4 className={`text-xs font-bold line-clamp-2 lg:truncate mt-0.5 ${
                        isSelected ? 'text-white' : 'text-slate-200'
                      }`}>
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {item.theory}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {itemDone ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> Сдан
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        <Circle className="w-3 h-3" /> В процессе
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Карточка выбранного урока */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-4 lg:overflow-y-auto custom-scroll lg:min-h-0">
          <div className="space-y-4">
            {/* Шапка карточки */}
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30">
                    {lesson.module}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{lesson.timecode}</span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">
                  {lesson.title}
                </h2>
              </div>
              <div>
                {isDone ? (
                  <span className="flex items-center gap-1.5 text-xs font-mono uppercase px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ЗАЧЁТ СДАН
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-mono uppercase px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                    ТРЕБУЕТСЯ СДАТЬ НОРМАТИВ
                  </span>
                )}
              </div>
            </div>

            {/* Методическое обоснование */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1">
                📖 Методическое обоснование и физиология навыка:
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
                {lesson.theory}
              </p>
            </div>

            {/* Литература */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1">
                📚 Рекомендуемые сборники и страницы (nota-re.ru / Boosty):
              </h4>
              <p className="text-xs text-sky-300 font-mono bg-sky-950/20 border border-sky-500/25 p-2.5 rounded-xl">
                {lesson.books}
              </p>
            </div>

            {/* Пошаговые действия */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1.5">
                🎯 Пошаговый алгоритм выполнения на уроке:
              </h4>
              <div className="space-y-1.5 text-xs text-slate-300">
                {lesson.steps.map((st, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{st}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Нормативы сдачи */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1.5">
                📊 Норматив зачёта (автоматическая фиксация в студии):
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Серия номеров</div>
                  <div className="text-sm font-bold font-mono text-purple-400 mt-0.5">{lesson.normReps} упр.</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Точность попадания</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">≥ {lesson.normAcc}%</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Скорость реакции</div>
                  <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">&lt; {lesson.normSpeed} мс</div>
                </div>
              </div>

              {/* Сводка пресета */}
              <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                ⚡ Пресет тренажёра: Режим: <strong className="text-emerald-400">{lesson.preset.mode}</strong> | Диапазон: <strong className="text-sky-400">{lesson.preset.filter}</strong> | Тональность: <strong className="text-amber-400">{lesson.preset.tonality}</strong> | Темп: <strong className="text-white">{lesson.preset.bpm} BPM</strong>
              </div>
            </div>
          </div>

          {/* Нижняя панель действий карточки */}
          <div className="pt-4 mt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button 
                onClick={selectPrevCourseLesson}
                disabled={selectedLessonId <= 1}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Назад
              </button>
              <button 
                onClick={selectNextCourseLesson}
                disabled={selectedLessonId >= COURSE_CURRICULUM.length}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
              >
                Вперёд <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => toggleLessonCompleted(lesson.id)}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition ${
                  isDone 
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25' 
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                }`}
              >
                {isDone ? '✕ Снять отметку о сдаче' : '✓ Отметить как сданный вручную'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  if (confirm('Сбросить весь прогресс прохождения курса?')) {
                    resetCourseProgress();
                  }
                }}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 transition"
                title="Сбросить весь прогресс курса"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              {(lesson.id === 11 || lesson.id === 12) && (
                <button
                  type="button"
                  data-testid="course-two-hand-trial-launch"
                  onClick={() => startTwoHandCourseTrial(lesson.id)}
                  className="rounded-xl border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
                  title="Учебная MIDI-практика с двумя руками, без автоматического зачёта урока"
                >
                  Пробное задание: две руки (без зачёта)
                </button>
              )}
              <button 
                onClick={startActiveLessonInTrainer}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                Запустить этот урок в тренажёре →
              </button>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
