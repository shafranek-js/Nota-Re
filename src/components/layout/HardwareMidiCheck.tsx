import React, { useEffect, useRef, useState } from 'react';
import { midiManager } from '../../core/midi/MidiManager';
import {
  MidiHardwareCheck, makeHardwareCheckReport,
  type HardwareCheckSnapshot
} from '../../core/midi/hardwareCheck';
import { audioEngine } from '../../core/audio/AudioEngine';

const checklist = [
  { key: 'noteLifecyclePassed', label: 'Нажмите клавишу и отпустите её' },
  { key: 'polyphonyPassed', label: 'Удерживайте одновременно хотя бы две клавиши' },
  { key: 'sustainPassed', label: 'Нажмите педаль, сыграйте ноту, отпустите клавишу и затем педаль' },
  { key: 'disconnectPanicObserved', label: 'При удерживаемой ноте отключите MIDI-устройство (необязательно)' }
] as const;

export const HardwareMidiCheck: React.FC = () => {
  const tracker = useRef(new MidiHardwareCheck());
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [snapshot, setSnapshot] = useState<HardwareCheckSnapshot>(() => tracker.current.snapshot());
  const [savedReport, setSavedReport] = useState<string | null>(null);
  const inputCount = midiManager.getInputsCount();

  useEffect(() => {
    if (!running) return;
    return midiManager.onMidiEvent(event => {
      tracker.current.accept(event);
      setSnapshot(tracker.current.snapshot());
    });
  }, [running]);

  const start = () => {
    tracker.current.reset();
    setSnapshot(tracker.current.snapshot());
    setSavedReport(null);
    setStarted(true);
    setRunning(true);
  };

  const stop = () => {
    setSnapshot(tracker.current.snapshot());
    const data = makeHardwareCheckReport(
      tracker.current.snapshot(), audioEngine.getMidiAudioDiagnostics()
    );
    setSavedReport(data);
    setRunning(false);
  };

  const exportReport = () => {
    if (!savedReport) return;
    const url = URL.createObjectURL(new Blob([savedReport], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nota-re-midi-hardware-check.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div data-testid="midi-hardware-check" className="space-y-2 border-t border-slate-800 pt-3">
      <div className="text-xs font-semibold text-slate-200">Проверка физической MIDI-клавиатуры</div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Запустите тест и выполните действия на подключённом устройстве. Звук будет работать,
        но упражнения и зачёты не оцениваются, пока открыты настройки.
        Отключение устройства и педаль необязательны, если оборудование этого не поддерживает.
      </p>
      <p data-testid="hardware-midi-connection" className="text-[11px] text-slate-400">
        Подключено MIDI-входов: {inputCount}. {inputCount === 0
          ? 'Проверьте USB, разрешение MIDI в браузере и перезагрузите страницу.'
          : 'Можно начать проверку.'}
      </p>
      <div className="space-y-1.5">
        {checklist.map((item, index) => (
          <div key={item.key} className="flex items-start gap-2 text-[11px]">
            <span
              data-testid={'hardware-step-' + index}
              className={snapshot[item.key] ? 'text-emerald-300 font-bold' : 'text-slate-500'}
            >
              {snapshot[item.key] ? 'Пройдено' : 'Не проверено'}
            </span>
            <span className="text-slate-300">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        <span>Нажато / отпущено клавиш</span>
        <strong data-testid="hardware-note-count" className="text-right text-sky-200">
          {snapshot.noteOns} / {snapshot.noteOffs}
        </strong>
        <span>Удерживаемых клавиш / максимум</span>
        <strong data-testid="hardware-held" className="text-right text-sky-200">
          {snapshot.heldNotes} / {snapshot.maxHeldNotes}
        </strong>
        <span>Нажатий / отпусканий педали</span>
        <strong data-testid="hardware-pedal" className="text-right text-sky-200">
          {snapshot.sustainPresses} / {snapshot.sustainReleases}
        </strong>
      </div>
      <div className="flex flex-wrap gap-2">
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="rounded-lg border border-sky-600/50 px-2.5 py-1.5 text-xs text-sky-200"
          >
            {started ? 'Повторить проверку' : 'Начать проверку MIDI'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-emerald-600/50 px-2.5 py-1.5 text-xs text-emerald-200"
          >
            Завершить проверку
          </button>
        )}
        {savedReport && (
          <button
            type="button"
            onClick={exportReport}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200"
          >
            Скачать отчёт JSON
          </button>
        )}
      </div>
      {savedReport && (
        <p role="status" className="text-[11px] text-slate-400">
          Проверка завершена. Отчёт содержит только агрегированные результаты и браузерные
          оценки задержки — без MIDI-нот и данных устройства. Это не измерение звука из динамиков.
        </p>
      )}
    </div>
  );
};
