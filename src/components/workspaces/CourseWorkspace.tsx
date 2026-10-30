import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { COURSE_CURRICULUM } from '../../data/curriculum';
import { isTwoHandCourseLesson } from '../../core/training/courseAssessmentPolicy';
import { loadTwoHandShadowSeries } from '../../core/storage/twoHandShadowStorage';
import { CheckCircle2, Circle, ArrowLeft, ArrowRight, BookOpen, Info, Play, RotateCcw } from 'lucide-react';

const COURSE_MODULES = [
  { id: 'I', title: 'Позиция' }, { id: 'II', title: 'Ритм и бас' },
  { id: 'III', title: 'Интервалы' }, { id: 'IV', title: 'Две руки' }
] as const;
type ModuleFilter = 'all' | (typeof COURSE_MODULES)[number]['id'];

export const CourseWorkspace: React.FC = () => {
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const {
    selectedLessonId,
    selectCourseLesson,
    completedLessons,
    courseSeries,
    toggleLessonCompleted,
    resetCourseProgress,
    startActiveLessonInTrainer,
    prepareSelectedLessonInTrainer
  } = useAppStore();

  const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
  const isDone = completedLessons.includes(lesson.id);
  const isTwoHand = isTwoHandCourseLesson(lesson.id);
  const twoHandProgress = isTwoHand ? loadTwoHandShadowSeries(lesson.id as 11 | 12) : null;
  const savedRepetitions = courseSeries[lesson.id]?.completedExercises ?? 0;
  const doneCount = completedLessons.length;
  const filteredLessons = moduleFilter === 'all' ? COURSE_CURRICULUM
    : COURSE_CURRICULUM.filter(item => item.module.startsWith(`Модуль ${moduleFilter} •`));
  const selectModule = (filter: ModuleFilter) => {
    setModuleFilter(filter);
    if (filter !== 'all' && !lesson.module.startsWith(`Модуль ${filter} •`)) {
      const first = COURSE_CURRICULUM.find(item => item.module.startsWith(`Модуль ${filter} •`));
      if (first) selectCourseLesson(first.id);
    }
  };
  const selectedFilteredIndex = filteredLessons.findIndex(item => item.id === lesson.id);
  const moveLesson = (direction: -1 | 1) => {
    const next = filteredLessons[selectedFilteredIndex + direction];
    if (next) selectCourseLesson(next.id);
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
    <section className="flex-1 min-h-full lg:min-h-0 w-full min-w-0 p-2.5 sm:p-3 overflow-visible lg:overflow-hidden flex flex-col gap-2.5">
      {/* Compact course toolbar: useful module navigation, no duplicate hero/progress. */}
      <div data-testid="course-toolbar" className="relative z-10 shrink-0 w-full min-w-0 rounded-xl border border-slate-800 bg-slate-900/90 px-3 sm:px-4 py-2.5 flex flex-wrap lg:flex-nowrap items-center gap-x-3 gap-y-2">
        <div className="shrink-0 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <h1 className="text-sm sm:text-base lg:text-lg font-semibold whitespace-nowrap text-white tracking-tight">Программа чтения с листа</h1>
          <details data-testid="course-methodology" className="relative shrink-0">
            <summary className="list-none cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">О методике</span><span className="sr-only sm:hidden">О методике</span>
            </summary>
            <div role="note" className="absolute z-30 right-0 sm:right-auto sm:left-0 top-full mt-2 w-[min(85vw,23rem)] rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-xl text-xs text-slate-300 leading-relaxed whitespace-normal">
              <strong className="block mb-1 text-slate-100">NotaRe и Ф. Брянская</strong>
              12 недель и четыре модуля. Каждый урок развивает отдельный навык
              чтения нот: от работы без внутреннего проговаривания до опережающего
              зрения и независимости пальцев. Нормативы засчитываются по результатам практики.
            </div>
          </details>
        </div>
        <nav aria-label="Модули курса" data-testid="course-module-nav"
          className="w-full lg:w-auto lg:flex-1 min-w-0 max-w-full flex items-center gap-1 overflow-x-auto whitespace-nowrap custom-scroll">
          <button type="button" data-testid="course-module-all" aria-pressed={moduleFilter === 'all'}
            onClick={() => selectModule('all')}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${moduleFilter === 'all'
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-100'}`}>
            Все · {doneCount}/{COURSE_CURRICULUM.length}
          </button>
          {COURSE_MODULES.map(module => {
            const lessons = COURSE_CURRICULUM.filter(item => item.module.startsWith(`Модуль ${module.id} •`));
            const completed = lessons.filter(item => completedLessons.includes(item.id)).length;
            return (
              <button type="button" key={module.id} data-testid={`course-module-${module.id}`}
                aria-pressed={moduleFilter === module.id} onClick={() => selectModule(module.id)}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${moduleFilter === module.id
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-100'}`}>
                {module.id} · {module.title} <span className="text-slate-400 tabular-nums">({completed}/{lessons.length})</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* 2 Колонки: Список 12 уроков (слева) + Карточка выбранного урока (справа) */}
      <div className="w-full min-w-0 grid grid-cols-1 lg:grid-cols-12 lg:flex-1 lg:min-h-0 gap-2.5">
        
        {/* Список 12 уроков */}
        <div className="lg:col-span-5 min-w-0 flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl p-2 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pb-2 border-b border-slate-800 shrink-0">
            <span className="text-xs font-bold text-slate-300">Уроки ({filteredLessons.length} из 12)</span>
            <button type="button" data-testid="course-continue" onClick={continueCourse}
              title="Начать ближайший несданный урок независимо от выбранного"
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
              {allCompleted ? 'Повторить' : 'Продолжить'}: {moduleName}, Урок {nextLesson.id}
            </button>
          </div>

          <div data-testid="course-list-scroll" className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scroll space-y-1 pr-0.5 pt-1.5">
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
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border cursor-pointer transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 flex items-start justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/60 shadow-md shadow-emerald-950/40'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                      itemDone 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.id.toString().padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{item.module}</span>
                        <span className="text-[10px] text-slate-500">• {item.timecode}</span>
                      </div>
                      <h4 className={`text-xs font-bold line-clamp-2 lg:truncate ${
                        isSelected ? 'text-white' : 'text-slate-200'
                      }`}>
                        {item.title}
                      </h4>

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
        <div data-testid="course-detail-panel" className="order-first lg:order-none lg:col-span-7 min-w-0 flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2.5 lg:overflow-hidden lg:min-h-0">
            {/* Шапка карточки */}
            <div data-testid="course-selected-header" className="relative z-10 -mx-3 -mt-2.5 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30">
                    {lesson.module}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{lesson.timecode}</span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white mt-1 leading-snug">
                  {lesson.title}
                </h2>
              </div>
              <div className="shrink-0 flex flex-col items-stretch gap-2">
                <button type="button" data-testid="course-launch-selected"
                  aria-label={isTwoHand
                    ? `Открыть двухручную MIDI-практику: Урок ${lesson.id}`
                    : `Запустить этот урок в тренажёре: Урок ${lesson.id}`}
                  onClick={startActiveLessonInTrainer}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  {isTwoHand ? `Две руки · MIDI · Урок ${lesson.id}` : `Запустить урок ${lesson.id} (Студия)`}
                </button>
                {isDone ? (
                  <span className="flex items-center gap-1.5 text-xs font-mono uppercase px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ЗАЧЁТ СДАН
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-mono uppercase px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                    {isTwoHand ? 'РУЧНОЕ ПОДТВЕРЖДЕНИЕ' : 'ТРЕБУЕТСЯ СДАТЬ НОРМАТИВ'}
                  </span>
                )}
              </div>
            </div>

          <div data-testid="course-detail-scroll" className="flex-1 min-h-0 lg:overflow-y-auto custom-scroll space-y-2.5 pt-2">
            {isTwoHand && (
              <p data-testid="two-hand-certification-policy" className="text-xs text-amber-200 border border-amber-700/40 bg-amber-950/20 px-3 py-2 rounded-lg">
                MIDI-практика проверяет партии двух рук, синхронность и длительности.
                Аппликатуру, движение взгляда и выразительность legato MIDI не подтверждает.
                Автоматический зачёт отключён: после проверки остальных требований отметь урок сданным вручную.
                {twoHandProgress && (
                  <span data-testid="two-hand-saved-progress" className="block mt-1 font-semibold text-sky-200">
                    Сохранено MIDI-подготовки: {twoHandProgress.successfulStudies.length}/{lesson.normReps} этюдов.
                  </span>
                )}
              </p>
            )}
            {/* Методическое обоснование */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1">
                📖 Методическое обоснование и физиология навыка:
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                {lesson.theory}
              </p>
            </div>

            {/* Литература */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1">
                📚 Рекомендуемые сборники и страницы (nota-re.ru / Boosty):
              </h4>
              <p className="text-xs text-sky-300 font-mono bg-sky-950/20 border border-sky-500/25 px-3 py-1.5 rounded-lg">
                {lesson.books}
              </p>
            </div>

            {/* Пошаговые действия */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-slate-400 mb-1.5">
                🎯 Пошаговый алгоритм выполнения на уроке:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs text-slate-300">
                {lesson.steps.map((st, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/70 py-1.5 px-2 rounded-lg border border-slate-800/80">
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
                <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Серия номеров</div>
                  <div className="text-sm font-bold font-mono text-purple-400 mt-0.5">{lesson.normReps} упр.</div>
              {savedRepetitions > 0 && !isDone && (
                <p className="text-[11px] text-emerald-300 mt-1">Сохранено: {savedRepetitions} / {lesson.normReps}</p>
              )}
                </div>
                <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Точность попадания</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">≥ {lesson.normAcc}%</div>
                </div>
                <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Скорость реакции</div>
                  <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">&lt; {lesson.normSpeed} мс</div>
                </div>
              </div>

              {/* Сводка пресета */}
              <div className="mt-2 pt-1.5 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                ⚡ Пресет тренажёра: Режим: <strong className="text-emerald-400">{lesson.preset.mode}</strong> | Диапазон: <strong className="text-sky-400">{lesson.preset.filter}</strong> | Тональность: <strong className="text-amber-400">{lesson.preset.tonality}</strong> | Темп: <strong className="text-white">{lesson.preset.bpm} BPM</strong>
              </div>
            </div>
          </div>

          {/* Нижняя панель действий карточки */}
          <div className="pt-2.5 mt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => moveLesson(-1)}
                disabled={selectedFilteredIndex <= 0}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Назад
              </button>
              <button 
                onClick={() => moveLesson(1)}
                disabled={selectedFilteredIndex >= filteredLessons.length - 1}
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
              {!isTwoHand && (
                <button type="button" onClick={prepareSelectedLessonInTrainer}
                  className="px-3 py-2 rounded-xl border border-sky-500/40 bg-slate-800 hover:bg-slate-700 text-sky-200 font-semibold text-xs transition">
                  Сначала анализ нот
                </button>
              )}

            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
