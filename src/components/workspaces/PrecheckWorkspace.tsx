import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { TonalityKey } from '../../types/music';

export const PrecheckWorkspace: React.FC = () => {
  const { changeTonality, switchWorkspace } = useAppStore();

  const handleApplyTonality = (ton: TonalityKey) => {
    changeTonality(ton);
    switchWorkspace('trainer');
  };

  const steps = [
    {
      num: '01',
      title: 'Название и композитор (01:43)',
      desc: 'Определяет жанр, характер прикосновения и стиль («Марш» — четкий пульс и staccato, «Баркарола» — певучее legato).'
    },
    {
      num: '02',
      title: 'Тональность и Кварто-квинтовый круг (02:02 – 02:18)',
      desc: 'Считываем ключевые знаки (диезы или бемоли) и последнюю ноту в басу. Руки заранее получают «карту черных клавиш».'
    },
    {
      num: '03',
      title: 'Размер композиции и пульс (02:43)',
      desc: 'Устанавливаем метрическую сетку (2/4, 3/4, 4/4) и просчитываем один пустой такт вслух до начала игры.'
    },
    {
      num: '04',
      title: 'Проверка ключей в обеих строчках (03:00)',
      desc: 'Убеждаемся, в каких ключах написана пьеса (скрипичный + басовый или два одноименных ключа), и находим стартовые ноты.'
    },
    {
      num: '05',
      title: 'Анализ ритма и выбор темпа по самому сложному такту (03:18)',
      desc: 'Находим такт с самыми мелкими длительностями (шестнадцатые, пунктиры) и задаем темп пьесы по этому такту.'
    }
  ];

  const tonalities: { key: TonalityKey; title: string; badge: string; desc: string; border: string; textCol: string; badgeCol: string }[] = [
    {
      key: 'C',
      title: 'До мажор / ля минор',
      badge: '0 знаков',
      desc: 'Чистая диатоника по белым клавишам. Базовый фундамент для постановки пятипальцевой позиции.',
      border: 'border-emerald-500/50 hover:border-emerald-400',
      textCol: 'text-emerald-400',
      badgeCol: 'bg-emerald-500/20 text-emerald-300'
    },
    {
      key: 'G',
      title: 'Соль мажор / ми минор',
      badge: '1 диез: Фа♯',
      desc: 'Шаг по квинте вправо. Автоматическая замена всех нот Фа на чёрную клавишу Фа-диез (таймкод 17:07).',
      border: 'border-slate-800 hover:border-sky-500/50',
      textCol: 'text-sky-400',
      badgeCol: 'bg-sky-500/20 text-sky-300'
    },
    {
      key: 'F',
      title: 'Фа мажор / ре минор',
      badge: '1 бемоль: Си♭',
      desc: 'Шаг по кварте влево. Тактильное нащупывание третьей чёрной клавиши (Си-бемоль) 4-м пальцем.',
      border: 'border-slate-800 hover:border-amber-500/50',
      textCol: 'text-amber-400',
      badgeCol: 'bg-amber-500/20 text-amber-300'
    },
    {
      key: 'D',
      title: 'Ре мажор / си минор',
      badge: '2 диеза: Фа♯, До♯',
      desc: 'Два ключевых диеза. Одновременная работа с обеими группами из 2 и 3 чёрных клавиш.',
      border: 'border-slate-800 hover:border-purple-500/50',
      textCol: 'text-purple-400',
      badgeCol: 'bg-purple-500/20 text-purple-300'
    }
  ];

  return (
    <section className="flex-1 min-h-0 w-full p-4 overflow-y-auto custom-scroll">
      <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* 5-шаговый алгоритм подготовки */}
        <div className="xl:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold">
                Видео 1 (VCwxNO_LGj4) • Таймкод 01:33 – 03:30
              </span>
              <span className="text-xs text-slate-400">Обязательный доигровой протокол</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              🧭 5-шаговый алгоритм подготовки к чтению новой пьесы
            </h2>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Профессиональное чтение с листа начинается за 30 секунд до первого звука. Пройдите 5 шагов визуального сканирования:
            </p>

            <div className="space-y-2.5 text-xs">
              {steps.map(s => (
                <div key={s.num} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 font-mono font-bold flex items-center justify-center shrink-0">
                    {s.num}
                  </span>
                  <div>
                    <div className="font-bold text-white">{s.title}</div>
                    <p className="text-slate-400 mt-0.5 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Выбор тональности и знаков */}
        <div className="xl:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                Тренажёр тональностей • nota-re.ru
              </span>
              <span className="text-xs text-slate-400">Кварто-квинтовый круг</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              🎡 Выбор тональности и ключевых знаков для практики
            </h2>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Выберите тональность из кварто-квинтового круга ниже — тренажёр автоматически выставит ключевые знаки на нотном стане и активирует соответствующие чёрные клавиши:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {tonalities.map(t => (
                <button
                  type="button"
                  key={t.key}
                  onClick={() => handleApplyTonality(t.key)}
                  aria-label={`Запустить тренировку в тональности ${t.title}`}
                  data-testid={`precheck-tonality-${t.key}`}
                  className={`w-full text-left cursor-pointer p-4 rounded-xl bg-slate-950 border ${t.border} transition flex flex-col justify-between focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-bold text-sm ${t.textCol}`}>{t.title}</span>
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${t.badgeCol}`}>{t.badge}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2 leading-relaxed">{t.desc}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-sky-400 mt-2">
                    ▶ Запустить на стане →
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              Порядок диезов: <strong className="font-mono text-sky-400">Фа - До - Соль - Ре - Ля - Ми - Си</strong> • Бемолей: <strong className="font-mono text-amber-400">Си - Ми - Ля - Ре - Соль - До - Фа</strong>
            </span>
          </div>
        </div>

      </div>
    </section>
  );
};
