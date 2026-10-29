import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { COURSE_CURRICULUM } from '../../data/curriculum';
import { CheckCircle2, Circle, ArrowLeft, ArrowRight, Play, RotateCcw, Info } from 'lucide-react';

type CourseFilter = 'all' | 'I' | 'II' | 'III' | 'IV';
const MODULES: { id: Exclude<CourseFilter, 'all'>; name: string }[] = [
  { id: 'I', name: 'Позиция' }, { id: 'II', name: 'Ритм и бас' },
  { id: 'III', name: 'Интервалы' }, { id: 'IV', name: 'Две руки' }
];

export const CourseWorkspace: React.FC = () => {
  const [moduleFilter, setModuleFilter] = useState<CourseFilter>('all');
  const {
    selectedLessonId,
    selectCourseLesson,
    selectPrevCourseLesson,
    selectNextCourseLesson,
    completedLessons,
    toggleLessonCompleted,
    resetCourseProgress,
    startActiveLessonInTrainer,
    prepareSelectedLessonInTrainer,
    startTwoHandCourseTrial
  } = useAppStore();

  const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
  const isDone = completedLessons.includes(lesson.id);
  const doneCount = completedLessons.length;
  const filteredLessons = moduleFilter === 'all' ? COURSE_CURRICULUM :
    COURSE_CURRICULUM.filter(item => item.module.startsWith(`Модуль ${moduleFilter} •`));
  const filterByModule = (next: CourseFilter) => {
    setModuleFilter(next);
    if (next !== 'all' && !COURSE_CURRICULUM.some(item => item.id === selectedLessonId && item.module.startsWith(`Модуль ${next} •`))) {
      const firstLesson = COURSE_CURRICULUM.find(item => item.module.startsWith(`Модуль ${next} •`));
      if (firstLesson) selectCourseLesson(firstLesson.id);
    }
  };
  // Continue from actual certified progress, never from the last browsed
  // lesson. An independently explored lesson does not imply completion.
  const nextLesson = COURSE_CURRICULUM.find(item => !completedLessons.includes(item.id))
    ?? COURSE_CURRICULUM[COURSE_CURRICULUM.length - 1];
  const moduleName = nextLesson.module.split(' • ')[0];
  const allCompleted = doneCount === COURSE_CURRICULUM.length;
  const continueCourse = () => {
    selectCourseLesson(nextLesson.id);
    startActiveLessonInTrainer();
  };

  return (
    <section className="flex-1 min-h-full lg:min-h-0 w-full p-3 sm:p-3.5 overflow-visible lg:overflow-hidden flex flex-col gap-3">
      {/* Компактная панель курса: без дублирования глобального прогресса. */}
      <div data-testid="course-toolbar" className="shrink-0 min-w-0 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
        <div className="shrink-0 flex items-center gap-2 min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-white whitespace-nowrap">Программа чтения с листа</h1>
          <details className="relative group">
            <summary data-testid="course-methodology" className="cursor-pointer list-none rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" aria-label="О методике курса">
              <span className="inline-flex items-center gap-1"><Info className="w-3.5 h-3.5" aria-hidden="true"/><span className="hidden sm:inline">О методике</span></span>
            </summary>
            <div role="note" className="absolute left-0 top-full mt-2 z-30 w-[min(340px,calc(100vw-36px))] rounded-xl border border-slate-700 bg-slate-950 shadow-xl p-3 text-xs text-slate-300 leading-relaxed">
              <strong className="block mb-1 text-slate-100">Nota Re & Ф. Брянская · 12 недель</strong>
              Каждый урок настраивает тренажёр на конкретный психологический приём: от отключения внутреннего голоса до опережающего зрения и независимости пальцев. Сдавайте нормативы зачётной серии для перехода к следующему этапу.
            </div>
          </details>
        </div>
        <nav aria-label="Фильтр модулей курса" className="order-3 basis-full sm:order-none sm:basis-auto min-w-0 flex-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap custom-scroll py-0.5">
          <button type="button" data-testid="course-filter-all" aria-pressed={moduleFilter === 'all'}
            onClick={() => filterByModule('all')}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${moduleFilter === 'all' ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
            Все · {COURSE_CURRICULUM.length}
          </button>
          {MODULES.map(module => {
            const lessons = COURSE_CURRICULUM.filter(item => item.module.startsWith(`Модуль ${module.id} •`));
            const passed = lessons.filter(item => completedLessons.includes(item.id)).length;
            return (
              <button type="button" key={module.id} data-testid={`course-filter-${module.id}`}
                aria-pressed={moduleFilter === module.id} onClick={() => filterByModule(module.id)}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${moduleFilter === module.id ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                {module.id} · {module.name} <span className="ml-1 font-mono opacity-70">{passed}/{lessons.length}</span>
              </button>
            );
          })}
        </nav>
        <button type="button" data-testid="course-continue" onClick={continueCourse}
          title={`Следующий несданный урок: ${nextLesson.title}`}
          className="shrink-0 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          {allCompleted ? 'Повторить' : 'Продолжить'}: {moduleName}, Урок {nextLesson.id}
        </button>
      </div>

      {/* 2 Колонки: Список 12 уроков (слева) + Карточка выбранного урока (справа) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 lg:flex-1 lg:min-h-0 gap-3.5">
        
        {/* Список 12 уроков */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl p-3 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2.5 border-b border-slate-800 shrink-0">
            <span className="text-xs font-bold uppercase font-mono text-slate-400">{moduleFilter === 'all' ? 'Уроки программы (1–12)' : `Модуль ${moduleFilter} · ${filteredLessons.length} урока`}</span>
            <span className="text-xs text-slate-500 font-mono">Нажмите для выбора</span>
          </div>

          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scroll space-y-2 pr-1 pt-2">
            {filteredLessons.map(item => {
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
                  className={`w-full text-left p-2.5 rounded-xl border cursor-pointer transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 flex items-start justify-between gap-2.5 ${
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
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-3 lg:overflow-y-auto custom-scroll lg:min-h-0">
          <div className="space-y-3">
            {/* Заголовок урока и постоянно видимый запуск. */}
            <div data-testid="course-lesson-header" className="sticky top-0 z-10 -mt-1 flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 bg-slate-900 py-2">
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" data-testid="course-start-selected" aria-label={`Запустить этот урок в тренажёре: урок ${lesson.id}`} onClick={startActiveLessonInTrainer}
                  className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
                  <Play aria-hidden="true" className="w-3.5 h-3.5" /> Запустить урок {lesson.id} (Студия)
                </button>
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
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-1.5 text-xs text-slate-300">
                {lesson.steps.map((st, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
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
              <button type="button" onClick={prepareSelectedLessonInTrainer}
                className="px-3 py-2 rounded-xl border border-sky-500/40 bg-slate-800 hover:bg-slate-700 text-sky-200 font-semibold text-xs transition">
                Сначала анализ нот
              </button>
              {(lesson.id === 11 || lesson.id === 12) && (
                <button type="button" data-testid="course-two-hand-trial-launch"
                  onClick={() => startTwoHandCourseTrial(lesson.id)}
                  className="rounded-xl border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
                  title="Отдельная MIDI-практика с двумя руками, без зачёта учебного норматива">
                  Пробное задание: две руки (без зачёта)
                </button>
              )}

            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
