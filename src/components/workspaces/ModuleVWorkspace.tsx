import React, { useState } from 'react';
import { MODULE_V_STAGES, MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID, MODULE_V_LEFT_TEXTURES_ID, MODULE_V_TWO_HANDS_ID, MODULE_V_CADENCES_ID } from '../../data/moduleVCurriculum';
import { loadModuleVPractice } from '../../core/storage/moduleVPracticeStorage';
import { useAppStore } from '../../store/useAppStore';
import { ArrowLeft, BookOpen, Play } from 'lucide-react';
import { ModuleVInversionPractice } from './ModuleVInversionPractice.tsx';
import { ModuleVLeftPractice } from './ModuleVLeftPractice.tsx';
import { ModuleVCoordinationPractice } from './ModuleVCoordinationPractice.tsx';

/**
 * Own ungraded route, not a 13th CourseLesson. The remaining stages are
 * roadmap-only until independent musical assessment and UAT exist.
 */
export const ModuleVWorkspace: React.FC = () => {
  const { setModuleVRouteOpen, startModuleVLesson } = useAppStore();
  const [stageView, setStageView] = useState<'v1' | 'v2' | 'v3' | 'v4' | 'v5'>('v1');
  // The workspace remounts on return from Studio; read only this isolated key.
  const practice = loadModuleVPractice();
  const played = practice.completedFixtures.includes('C-major-5-3');

  return (
    <section data-testid="module-v-workspace"
      className="flex-1 min-h-0 w-full min-w-0 overflow-y-auto p-2.5 sm:p-3 flex flex-col gap-2.5">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-sky-300 shrink-0" aria-hidden="true"/>
          <h1 className="font-semibold text-base text-white">Модуль V · Чтение аккордов</h1>
          <span className="text-[11px] text-amber-300">Учебная практика · без зачёта</span>
        </div>
        <button type="button" data-testid="module-v-back"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          onClick={() => setModuleVRouteOpen(false)}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true"/> К урокам I–IV
        </button>
      </div>

      <div className="grid lg:grid-cols-12 gap-2.5 min-w-0 flex-1 lg:min-h-0">
        <nav aria-label="Шаги модуля V" className="lg:col-span-5 min-w-0 rounded-xl border border-slate-800 bg-slate-900/90 p-2 space-y-1">
          <p className="px-2 py-1 text-xs text-slate-400">Маршрут от чтения трезвучия до каденции</p>
          {MODULE_V_STAGES.map((stage, index) =>
            <div key={stage.id} data-testid={`module-v-stage-${index + 1}`}
              aria-current={(stage.id === MODULE_V_TRIADS_ID && stageView === 'v1') ||
                (stage.id === MODULE_V_INVERSIONS_ID && stageView === 'v2') ||
                (stage.id === MODULE_V_LEFT_TEXTURES_ID && stageView === 'v3') ||
                (stage.id === MODULE_V_TWO_HANDS_ID && stageView === 'v4') ||
                (stage.id === MODULE_V_CADENCES_ID && stageView === 'v5') ? 'step' : undefined}
              className={`rounded-lg border px-3 py-2 text-xs ${stage.available
                ? 'border-sky-600/50 bg-sky-900/15'
                : 'border-slate-800 bg-slate-950/60'}`}>
              <div className="flex items-start justify-between gap-2">
                <strong className="text-slate-100">V{index + 1} · {stage.title}</strong>
                <span className={stage.available ? 'text-sky-300 shrink-0' : 'text-slate-500 shrink-0'}>
                  {stage.available ? 'Доступно' : 'В разработке'}
                </span>
              </div>
              <p className="text-slate-400 mt-1 leading-relaxed">{stage.summary}</p>
              {stage.id === MODULE_V_CADENCES_ID && (
                <button type="button" data-testid="module-v-open-v5"
                  className="mt-2 rounded-md border border-sky-600/60 px-2.5 py-1.5 text-sky-200 hover:bg-sky-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setStageView('v5')}>Открыть V5 · каденции</button>
              )}
              {stage.id === MODULE_V_TWO_HANDS_ID && (
                <button type="button" data-testid="module-v-open-v4"
                  className="mt-2 rounded-md border border-sky-600/60 px-2.5 py-1.5 text-sky-200 hover:bg-sky-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setStageView('v4')}>Открыть V4 · координация</button>
              )}
              {stage.id === MODULE_V_LEFT_TEXTURES_ID && (
                <button type="button" data-testid="module-v-open-v3"
                  className="mt-2 rounded-md border border-sky-600/60 px-2.5 py-1.5 text-sky-200 hover:bg-sky-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setStageView('v3')}>Открыть V3 · фактуры</button>
              )}
              {stage.id === MODULE_V_INVERSIONS_ID && (
                <button type="button" data-testid="module-v-open-v2"
                  className="mt-2 rounded-md border border-sky-600/60 px-2.5 py-1.5 text-sky-200 hover:bg-sky-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setStageView('v2')}>Открыть V2 · обращения</button>
              )}
            </div>
          )}
        </nav>

        <div className="lg:col-span-7 min-w-0 rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex flex-col gap-3">
          {stageView === 'v5' ? (
            <>
              <button type="button" data-testid="module-v-v5-return-v1"
                className="self-start text-xs text-sky-300 underline underline-offset-2"
                onClick={() => setStageView('v1')}>Вернуться к V1</button>
              <ModuleVCoordinationPractice key="v5" stage="v5" />
            </>
          ) : stageView === 'v4' ? (
            <>
              <button type="button" data-testid="module-v-v4-return-v1"
                className="self-start text-xs text-sky-300 underline underline-offset-2"
                onClick={() => setStageView('v1')}>Вернуться к V1</button>
              <ModuleVCoordinationPractice key="v4" stage="v4" />
            </>
          ) : stageView === 'v3' ? (
            <>
              <button type="button" data-testid="module-v-v3-return-v1"
                className="self-start text-xs text-sky-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                onClick={() => setStageView('v1')}>Вернуться к V1</button>
              <ModuleVLeftPractice />
            </>
          ) : stageView === 'v2' ? (
            <>
              <button type="button" data-testid="module-v-return-v1"
                className="self-start text-xs text-sky-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                onClick={() => setStageView('v1')}>Вернуться к V1</button>
              <ModuleVInversionPractice />
            </>
          ) : (
            <>
          <div>
            <p className="text-[11px] font-mono text-sky-300">V1 · {MODULE_V_TRIADS_ID}</p>
            <h2 className="text-base font-semibold text-slate-100 mt-1">
              Сначала читаем вертикаль, затем играем
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed mt-1">
              До мажор, скрипичный ключ, одна правая рука. В партитуре OSMD
              видны четыре отдельных трезвучия C–E–G в основном виде.
              Все три клавиши нажимаются вместе, затем отпускаются перед повторением.
              Фиксированная партитура не меняется из-за предыдущих настроек Студии.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-xs text-slate-300 space-y-1.5">
            <strong className="block text-slate-100">Как заниматься</strong>
            <p>1. Откройте упражнение и дождитесь появления полного нотного стана. Ничего не играйте до окончания загрузки.</p>
            <p>2. Найдите в аккорде нижнюю, среднюю и верхнюю ноту. Раскройте разбор 5/3, если нужна помощь.</p>
            <p>3. На MIDI-клавиатуре четыре раза сыграйте настоящий трёхзвучный аккорд: окно одновременности 180 мс. Между повторами отпускайте все три клавиши.</p>
            <p>4. При ошибке читайте обратную связь и повторяйте тот же нотный текст. Метроном и критерии ритма здесь пока не оцениваются.</p>
          </div>
          <p data-testid="module-v-practice-status" className={played
            ? 'text-sm text-emerald-300' : 'text-sm text-amber-200'}>
            {played
              ? 'Четыре MIDI-аккорда выполнены ранее. Можно повторить.'
              : 'MIDI-практика этого примера пока не зарегистрирована.'}
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-400 max-w-lg">
              Это отдельный учебный журнал, не сертификат и не отметка о сдаче уроков 1–12.
              Номера пальцев, ритм и выразительность не проверяются.
            </p>
            <button type="button" data-testid="module-v-start-v1"
              onClick={() => startModuleVLesson(MODULE_V_TRIADS_ID)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
              <Play className="h-3.5 w-3.5" aria-hidden="true"/>
              {played ? 'Повторить V1 в Студии' : 'Открыть V1 в Студии'}
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
