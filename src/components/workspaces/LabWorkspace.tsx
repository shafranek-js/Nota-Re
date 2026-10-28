import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { audioEngine } from '../../core/audio/AudioEngine';
import { HanonType } from '../../types/music';
import { Volume2 } from 'lucide-react';

export const LabWorkspace: React.FC = () => {
  const {
    setHanonType,
    setAppMode,
    switchWorkspace,
    bpm
  } = useAppStore();

  const handleLoadHanon = (type: HanonType) => {
    setHanonType(type);
    setAppMode('hanon');
    switchWorkspace('trainer');
  };

  const hanons: { type: HanonType; title: string; badge: string; desc: string; textCol: string; borderCol: string }[] = [
    {
      type: 'hanon1',
      title: '1. Ганон №1 (Прямой и обратный ход)',
      badge: '1-2-3-4-5',
      desc: 'Терцовый скачок между 1 и 2 пальцами вверх (C-E-F-G-A-G-F-E) и между 5 и 4 пальцами вниз.',
      textCol: 'text-rose-300 group-hover:text-rose-200',
      borderCol: 'hover:border-rose-500/50'
    },
    {
      type: 'hanon2',
      title: '2. Ганон №2 (Упор на 4 и 5 пальцы)',
      badge: 'Слабые пальцы',
      desc: 'Интенсивная проработка внешних пальцев кисти (1-2-5-4-3-4-3-2). Убирает зажатость мизинца.',
      textCol: 'text-rose-300 group-hover:text-rose-200',
      borderCol: 'hover:border-rose-500/50'
    },
    {
      type: 'groups4',
      title: '3. Чтение блоками по 4 ноты (12:02)',
      badge: 'Этюды Черни',
      desc: 'Глаз схватывает графическую фигуру из 4 нот целиком, а рука исполняет её единым импульсом.',
      textCol: 'text-sky-300 group-hover:text-sky-200',
      borderCol: 'hover:border-sky-500/50'
    },
    {
      type: 'coord',
      title: '4. Штрихи: Стаккато + Легато (05:32)',
      badge: '2 руки',
      desc: 'Левая рука играет четвертями на стаккато, правая — восьмыми на легато.',
      textCol: 'text-amber-300 group-hover:text-amber-200',
      borderCol: 'hover:border-amber-500/50'
    }
  ];

  const syllables: { type: 'ta' | 'titi' | 'tiritiri' | 'taa'; title: string; noteSym: string; desc: string }[] = [
    {
      type: 'ta',
      title: 'ТА — ТА — ТА — ТА',
      noteSym: '♩ ♩ ♩ ♩',
      desc: 'Четвертные доли. Базовый шаг метрического пульса.'
    },
    {
      type: 'titi',
      title: 'ТИ-ТИ — ТА',
      noteSym: '♫ ♩ ♫ ♩',
      desc: 'Восьмые длительности. Две ровные ноты на один удар пульса.'
    },
    {
      type: 'tiritiri',
      title: 'ТИ-РИ-ТИ-РИ — ТА',
      noteSym: '♬ ♩',
      desc: 'Группы шестнадцатых. Слитный речевой блок на одну долю.'
    },
    {
      type: 'taa',
      title: 'ТА-А — ТА — ТА',
      noteSym: '𝅗𝅥 ♩ ♩',
      desc: 'Половинная нота. Плавное голосовое удержание двух долей.'
    }
  ];

  return (
    <section className="flex-1 min-h-0 w-full p-4 overflow-y-auto custom-scroll">
      <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Лаборатория Ганона */}
        <div className="xl:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold">
                Таймкоды 02:27 – 03:35 и 35:45
              </span>
              <span className="text-xs text-slate-400">Развитие пианистического аппарата взрослого</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              💪 Лаборатория Ганона и Независимости Рук
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Взрослому начинающему мало узнать ноту глазами — нужно мгновенно отправить моторный импульс в кончик нужного пальца. Секвенции Ганона прицельно включают слабые <strong>4-й и 5-й пальцы</strong> и приучают глаз считывать <strong>блоки из 4 нот одним движением</strong>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {hanons.map(h => (
                <button
                  type="button"
                  key={h.type}
                  data-testid={`lab-hanon-${h.type}`}
                  aria-label={`Запустить упражнение: ${h.title}`}
                  onClick={() => handleLoadHanon(h.type)}
                  className={`w-full text-left cursor-pointer group bg-slate-950/90 hover:bg-slate-950 border border-slate-800 ${h.borderCol} rounded-xl p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className={`font-bold text-sm ${h.textCol}`}>{h.title}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      {h.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2 leading-relaxed">{h.desc}</p>
                  <span className="text-[11px] font-semibold text-emerald-400">
                    ▶ Запустить на полном стане →
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Послушайте разницу артикуляции (левая рука — стаккато, правая — легато):</span>
            <button
              onClick={() => audioEngine.playArticulationDemo(bpm)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold transition"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Прослушать демо штрихов (Легато + Стаккато)</span>
            </button>
          </div>
        </div>

        {/* Лаборатория ритмослогов */}
        <div className="xl:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                Таймкод 27:33 – 33:30
              </span>
              <span className="text-xs text-slate-400">Ю. Фролова • Е. Олёрская • О. Берак</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              🎵 Система ритмослогов вместо счёта
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Математический счёт «раз-и-два-и» парализует внимание при чтении с листа. Ритмослоги позволяют мгновенно узнавать ритмическую фигуру целиком.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {syllables.map(s => (
                <button
                  type="button"
                  key={s.type}
                  data-testid={`lab-rhythm-${s.type}`}
                  aria-label={`Прослушать ритм: ${s.title}`}
                  onClick={() => audioEngine.playSyllablePatternDemo(s.type, bpm)}
                  className="w-full text-left cursor-pointer bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl p-3.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  title="Нажмите, чтобы прослушать ритм"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="font-mono font-bold text-sm text-amber-400">{s.title}</span>
                    <span className="text-xs text-slate-500">{s.noteSym}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => {
                setAppMode('rhythm');
                switchWorkspace('trainer');
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
            >
              🎵 Перейти к чтению с ритмослогами →
            </button>
            <button
              onClick={() => audioEngine.playSyllablePatternDemo('titi', bpm)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Прослушать ритм упражнения</span>
            </button>
          </div>
        </div>

      </div>
    </section>
  );
};
