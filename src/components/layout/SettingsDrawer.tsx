import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FilterType, HanonType, SpeechType } from '../../types/music';
import { X } from 'lucide-react';
import { audioEngine } from '../../core/audio/AudioEngine';

export const SettingsDrawer: React.FC = () => {
  const [soundStatus, setSoundStatus] = useState(audioEngine.getSoundFontStatus);
  const [soundError, setSoundError] = useState<string | null>(null);

  useEffect(() => audioEngine.subscribeSoundFont(setSoundStatus), []);

  const handleCustomBank = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setSoundError(null);
    try { await audioEngine.importCustomSoundFont(file); }
    catch (error) { setSoundError(error instanceof Error ? error.message : String(error)); }
  };

  const handleDefaultBank = async () => {
    setSoundError(null);
    try { await audioEngine.selectBuiltInSoundFont(); }
    catch (error) { setSoundError(error instanceof Error ? error.message : String(error)); }
  };

  const handleEnableSoundFont = () => {
    audioEngine.setPianoOutput('soundfont');
    void audioEngine.prepareSoundFont(true);
  };

  const {
    isSettingsOpen,
    toggleSettingsDrawer,
    currentFilter,
    setClefFilter,
    speechSuppressor,
    setSpeechSuppressor,
    photoExposureMs,
    setPhotoExposure,
    currentHanonType,
    setHanonType,
    resetSessionStats
  } = useAppStore();

  if (!isSettingsOpen) return null;

  const filters: { id: FilterType; label: string; desc: string }[] = [
    { id: 'treble', label: '200 упражнений (C4–G4):', desc: '5 пальцев в одной позиции' },
    { id: 'treble_oct2', label: 'Вторая октава (C4–D5):', desc: 'Выход за 5 пальцев и переносы' },
    { id: 'bass', label: 'М. Литовко + 300 упр. (C3–B3):', desc: 'Прокачка басового ключа' },
    { id: 'both', label: 'Две руки («Буква Г»):', desc: 'Бас на 1-ю долю + мелодия' }
  ];

  return (
    <>
      <div 
        onClick={toggleSettingsDrawer}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
      />
      <aside className="fixed top-0 right-0 h-full w-80 sm:w-96 bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col justify-between p-5">
        <div className="space-y-4 overflow-y-auto custom-scroll pr-1">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-base text-white">⚙️ Настройки тренажёра</h3>
              <p className="text-xs text-slate-400">Ручная калибровка параметров</p>
            </div>
            <button 
              onClick={toggleSettingsDrawer}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Piano SoundFont – included bank works without uploading a file. */}
          <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/60 p-3" data-testid="piano-sound-settings">
            <label className="block text-xs font-bold uppercase font-mono text-slate-300">
              Звук фортепиано
            </label>
            <div className="flex gap-2" role="group" aria-label="Звуковой движок">
              <button
                type="button"
                aria-pressed={soundStatus.output === 'soundfont'}
                onClick={handleEnableSoundFont}
                className={'rounded-lg border px-3 py-1.5 text-xs ' +
                  (soundStatus.output === 'soundfont'
                    ? 'border-emerald-500 text-emerald-300 bg-emerald-500/15'
                    : 'border-slate-700 text-slate-300')}
              >
                SoundFont (по умолчанию)
              </button>
              <button
                type="button"
                aria-pressed={soundStatus.output === 'oscillator'}
                onClick={() => audioEngine.setPianoOutput('oscillator')}
                className={'rounded-lg border px-3 py-1.5 text-xs ' +
                  (soundStatus.output === 'oscillator'
                    ? 'border-emerald-500 text-emerald-300 bg-emerald-500/15'
                    : 'border-slate-700 text-slate-300')}
              >
                Синтезатор
              </button>
            </div>
            <div className="text-xs text-slate-400">
              Банк: <strong className="text-sky-300">
                {soundStatus.source === 'builtin' ? 'MuseScore General v0.2 (встроенный)' : soundStatus.bankName}
              </strong>
            </div>
            <div className="text-xs text-slate-400" role="status">
              {soundStatus.phase === 'ready' ? 'Звуковой банк готов к воспроизведению.' :
                soundStatus.phase === 'loading' ? 'Загрузка и подготовка звукового банка…' :
                soundStatus.phase === 'error' ? 'Не удалось загрузить SoundFont — доступен синтезатор.' :
                'Банк загрузится при первом воспроизведении или по нажатию SoundFont.'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={soundStatus.phase === 'loading'}
                onClick={() => void handleDefaultBank()}
                className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 disabled:opacity-50"
              >
                Встроенный банк
              </button>
              <label className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 cursor-pointer hover:border-sky-500">
                Подключить свой SF2/SF3
                <input
                  type="file"
                  accept=".sf2,.sf3"
                  className="sr-only"
                  onChange={handleCustomBank}
                  aria-label="Выбрать собственный SoundFont SF2 или SF3"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              Свой банк сохраняется только в браузере (IndexedDB), не отправляется на сервер.
              Встроенный MuseScore General — MIT. При ошибке используется старый синтезатор.
            </p>
            {(soundError || soundStatus.error) && (
              <p role="alert" className="text-xs text-rose-300">
                {soundError ?? soundStatus.error}
              </p>
            )}
          </div>

          {/* 1. Сборник и диапазон */}
          <div>
            <label className="block text-xs font-bold uppercase font-mono text-slate-400 mb-2">
              1. Сборник и диапазон нот
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {filters.map(f => {
                const isSelected = currentFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setClefFilter(f.id)}
                    className={`text-left px-3 py-2 rounded-xl text-xs font-medium border transition ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <strong>{f.label}</strong> {f.desc}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Глушитель называния нот */}
          <div>
            <label className="block text-xs font-bold uppercase font-mono text-slate-400 mb-1.5">
              2. Глушитель называния нот (15:05)
            </label>
            <select
              value={speechSuppressor}
              onChange={(e) => setSpeechSuppressor(e.target.value as SpeechType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="count">Счёт вслух: «1 - 2 - 3 - 4» (отключает называние нот)</option>
              <option value="tata">Нейтральный слог: «ТА - ТА - ТА - ТА»</option>
              <option value="syllables">Ритмослоги Фроловой: «ТА, ТИ-ТИ, ТИ-РИ-ТИ-РИ»</option>
              <option value="solfege">Пение высоты голосом (предслышание по Фридкину)</option>
            </select>
          </div>

          {/* 3. Окно экспозиции фото-памяти */}
          <div>
            <label className="block text-xs font-bold uppercase font-mono text-slate-400 mb-1.5">
              3. Окно экспозиции «Фотографирование» (17:45)
            </label>
            <select
              value={photoExposureMs}
              onChange={(e) => setPhotoExposure(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="2400">Начальный: 2.4 секунды на схватывание такта</option>
              <option value="1800">Стандартный: 1.8 секунды на схватывание такта</option>
              <option value="1100">Продвинутый: 1.1 секунды (мгновенный снимок)</option>
            </select>
          </div>

          {/* 4. Профиль упражнений Ганона */}
          <div>
            <label className="block text-xs font-bold uppercase font-mono text-slate-400 mb-1.5">
              4. Профиль упражнений Ганона (02:31)
            </label>
            <select
              value={currentHanonType}
              onChange={(e) => setHanonType(e.target.value as HanonType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
            >
              <option value="hanon1">Ганон №1: Терция 1–2 палец (C-E-F-G-A-G-F-E)</option>
              <option value="hanon2">Ганон №2: Упор на 4 и 5 пальцы (C-D-G-F-E-F-E-D)</option>
              <option value="groups4">Чтение блоками по 4 ноты (Визуальные паттерны)</option>
              <option value="coord">Координация: Стаккато в басу + Легато в мелодии</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              resetSessionStats();
            }}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 text-xs font-medium transition"
          >
            Сбросить статистику
          </button>
          <button
            onClick={toggleSettingsDrawer}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
          >
            Готово
          </button>
        </div>
      </aside>
    </>
  );
};
