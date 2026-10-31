import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Download, PlugZap } from 'lucide-react';
import {
  createStreamingNoteTracker, createMicrophoneReport, MAX_EVENTS,
  type DiagnosticEvent
} from '../../core/audio/microphoneLab';

type Detector = import('@markusstrasser/pitchplease').Detector;
type Report = ReturnType<typeof createMicrophoneReport>;
type Session = {
  startedAtMs: number; startedAtIso: string; frames: number;
  detected: DiagnosticEvent[]; midi: DiagnosticEvent[]; pedal: number;
  sameInstrumentMidi: boolean;
};
const captureSettings = {
  echoCancellation: false, noiseSuppression: false, autoGainControl: false
} as const;
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
const formatNote = (midi: number) => names[midi % 12] + (Math.floor(midi / 12) - 1);
const btn = 'rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-sky-400 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400';

export const MicrophoneResearchPanel: React.FC = () => {
  const [status, setStatus] = useState('Микрофон выключен. Доступ не запрашивался.');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [frames, setFrames] = useState(0);
  const [attackCount, setAttackCount] = useState(0);
  const [midiCount, setMidiCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [midiPorts, setMidiPorts] = useState<{ id: string; name: string }[]>([]);
  const [midiPortId, setMidiPortId] = useState('');
  const [sameInstrument, setSameInstrument] = useState(false);
  const [midiError, setMidiError] = useState('');
  const detectorRef = useRef<Detector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const midiAccessRef = useRef<WebMidi.MIDIAccess | null>(null);
  const midiPortRef = useRef<WebMidi.MIDIInput | null>(null);
  const generation = useRef(0);
  const stopTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const receiveMidi = useCallback((event: WebMidi.MIDIMessageEvent) => {
    const session = sessionRef.current;
    if (!session || !session.sameInstrumentMidi || !event.data) return;
    const statusByte = event.data[0], pitch = event.data[1], velocity = event.data[2];
    const kind = statusByte & 0xf0;
    if (kind === 0xb0 && pitch === 64) {
      session.pedal++;
    } else if (kind === 0x90 && velocity > 0 && pitch >= 21 && pitch <= 108 &&
      session.midi.length < MAX_EVENTS) {
      session.midi.push({ midi: pitch, atMs: performance.now() });
      if (mounted.current) setMidiCount(session.midi.length);
    }
  }, []);

  const attachMidi = useCallback((id: string) => {
    if (midiPortRef.current) midiPortRef.current.removeEventListener('midimessage', receiveMidi);
    const input = midiAccessRef.current?.inputs.get(id) ?? null;
    midiPortRef.current = input;
    if (input) input.addEventListener('midimessage', receiveMidi);
  }, [receiveMidi]);

  const stop = useCallback((reason = 'Микрофон отключён.') => {
    generation.current += 1;
    if (stopTimeout.current !== null) clearTimeout(stopTimeout.current);
    stopTimeout.current = null;
    const detector = detectorRef.current;
    detectorRef.current = null;
    try { detector?.stop(); } catch { /* Always release the media track. */ }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!mounted.current) return;
    setBusy(false); setRunning(false);
    if (session) {
      const durationMs = Math.min(130000, performance.now() - session.startedAtMs);
      setElapsed(Math.round(durationMs / 1000));
      try {
        setReport(createMicrophoneReport({
          startedAtIso: session.startedAtIso, durationMs, frameCount: session.frames,
          observed: session.detected, midiReference: session.midi,
          usesSameInstrumentMidi: session.sameInstrumentMidi,
          pedalEventCount: session.pedal,
          modelKernel: detector?.stats.kernel ?? null,
          modelCpuLoad: detector?.stats.cpuLoad ?? null
        }));
      } catch {
        setReport(null);
        setStatus('Ошибка проверки диагностического отчёта. Микрофон отключён.');
        return;
      }
    }
    setStatus(reason);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const visibility = () => { if (document.hidden) stop('Вкладка скрыта — микрофон отключён.'); };
    const pagehide = () => stop('Вкладка закрыта — микрофон отключён.');
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      // Leaving Lab or Studio MUST stop capture before the next workspace starts.
      stop();
      if (midiPortRef.current) midiPortRef.current.removeEventListener('midimessage', receiveMidi);
      midiPortRef.current = null;
    };
  }, [stop, receiveMidi]);

  const requestMidi = async () => {
    setMidiError('');
    if (!navigator.requestMIDIAccess) {
      setMidiError('Web MIDI недоступен в этом браузере.');
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      if (!mounted.current) return;
      midiAccessRef.current = access;
      const inputs = [...access.inputs.values()].filter(input => input.state === 'connected');
      setMidiPorts(inputs.map(input => ({ id: input.id, name: input.name ?? 'MIDI вход' })));
      setMidiError(inputs.length ? '' : 'Не найдено ни одного подключённого MIDI-входа.');
    } catch {
      if (mounted.current) setMidiError('Доступ к MIDI не предоставлен.');
    }
  };

  const start = async () => {
    if (busy || running) return;
    const requestId = ++generation.current;
    setBusy(true); setStatus('Запрашивается разрешение микрофона…');
    setReport(null); setRecent([]); setFrames(0); setAttackCount(0);
    setMidiCount(0); setElapsed(0);
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Error('Микрофон доступен только в HTTPS или на localhost.');
      }
      // Only explicit Start click requests microphone permission.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: captureSettings, video: false
      });
      if (generation.current !== requestId || !mounted.current) {
        stream.getTracks().forEach(t => t.stop()); return;
      }
      const library = await import('@markusstrasser/pitchplease');
      if (generation.current !== requestId || !mounted.current) {
        stream.getTracks().forEach(t => t.stop()); return;
      }
      if (library.version !== '3.1.0' || !library.models.some(model => model.id === 'piano')) {
        throw Error('Модель распознавания имеет неподдерживаемую версию.');
      }
      const tracker = createStreamingNoteTracker();
      const session: Session = {
        startedAtMs: performance.now(), startedAtIso: new Date().toISOString(),
        frames: 0, detected: [], midi: [], pedal: 0,
        sameInstrumentMidi: sameInstrument && Boolean(midiPortRef.current)
      };
      sessionRef.current = session;
      const detector = library.create({
        model: 'piano',
        assetBaseUrl: new URL(`${import.meta.env.BASE_URL}pitchplease/`, window.location.href).href,
        onNotes(notes, frame) {
          if (sessionRef.current !== session) return;
          try {
            session.frames++;
            const found = tracker.push({ time: frame.time, notes });
            const deliveredAt = performance.now();
            for (const note of found) {
              if (session.detected.length >= MAX_EVENTS) break;
              session.detected.push({
                midi: note.midi, atMs: deliveredAt, confidence: note.confidence
              });
            }
            if (mounted.current && found.length) {
              setRecent(previous => [
                ...found.map(note => `${formatNote(note.midi)} · ${Math.round(note.confidence * 100)}%`),
                ...previous
              ].slice(0, 12));
              setAttackCount(session.detected.length);
            }
            if (mounted.current && session.frames % 12 === 0) {
              setFrames(session.frames);
              setElapsed(Math.round((deliveredAt - session.startedAtMs) / 1000));
            }
          } catch {
            stop('Ошибка обработки звукового кадра. Микрофон отключён.');
          }
        },
        onError(error) {
          if (sessionRef.current === session) {
            stop('Ошибка AudioWorklet: ' + (error?.message ?? 'неизвестная ошибка'));
          }
        }
      });
      detectorRef.current = detector;
      streamRef.current = stream;
      const ready = await detector.start(stream);
      if (generation.current !== requestId || !mounted.current) return;
      if (!ready) throw Error('Не удалось запустить потоковый детектор.');
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (sessionRef.current === session) stop('Микрофон отключился.');
      }, { once: true }));
      setBusy(false); setRunning(true);
      setStatus('Прослушивание активно. Аудио остаётся только на устройстве.');
      stopTimeout.current = setTimeout(() =>
        stop('Лимит 120 секунд. Микрофон автоматически отключён.'), 120000);
    } catch (error) {
      if (generation.current !== requestId) {
        stream?.getTracks().forEach(track => track.stop()); return;
      }
      stop('Запуск не удался: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const exportJson = () => {
    if (!report || busy || running) return;
    const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nota-re-microphone-diagnostics.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div data-testid="microphone-research-panel"
      className="space-y-3 rounded-xl border border-sky-500/30 bg-slate-950/80 p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div>
          <h3 className="text-base font-semibold text-white">Акустическое пианино · Микрофон</h3>
          <p className="text-xs text-slate-400 mt-1">
            Потоковое распознавание аккордов и нот. Исследовательская практика — без зачётов.
          </p>
        </div>
        <span className="text-[11px] font-medium text-amber-300 border border-amber-500/40 rounded-full px-2 py-1">
          Только практика
        </span>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">
        Микрофон включается только по вашей команде. Звук не записывается и не отправляется.
        ML-модель загружается при запуске и может потребовать интернет при первом использовании.
        Отключите другие звуковые демонстрации, чтобы не получить ложные ноты.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={btn} data-testid="microphone-start"
          disabled={busy || running} onClick={() => void start()}>
          <span className="inline-flex items-center gap-1.5">
            <Mic className="w-4 h-4" aria-hidden="true"/>
            {busy ? 'Подготовка микрофона…' : 'Начать прослушивание'}
          </span>
        </button>
        <button type="button" className={btn} data-testid="microphone-stop"
          disabled={!busy && !running} onClick={() => stop()}>
          <span className="inline-flex items-center gap-1.5">
            <Square className="w-3.5 h-3.5" aria-hidden="true"/> Остановить
          </span>
        </button>
        <button type="button" className={btn} data-testid="microphone-export"
          disabled={!report || busy || running} onClick={exportJson}>
          <span className="inline-flex items-center gap-1.5">
            <Download className="w-4 h-4" aria-hidden="true"/> Скачать JSON
          </span>
        </button>
      </div>
      <p role="status" aria-live="polite" data-testid="microphone-status"
        className={running ? 'text-emerald-300 text-xs' : 'text-slate-400 text-xs'}>{status}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Кадров', frames], ['Атак', attackCount], ['MIDI-атак', sameInstrument && midiPortId ? midiCount : '—'],
          ['Длительность', `${elapsed} с`]
        ].map(([name, value]) => (
          <div key={name} className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="text-[11px] text-slate-400">{name}</div>
            <div className="font-mono font-semibold tabular-nums text-sky-200" data-testid={name === 'Кадров' ? 'microphone-frames' : undefined}>{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3">
        <p className="text-xs font-semibold text-slate-300 mb-1">Последние распознанные ноты</p>
        <div className="min-h-8 text-sm font-mono text-emerald-300" data-testid="microphone-notes">
          {recent.length ? recent.join('  ·  ') : '—'}
        </div>
      </div>
      <details className="rounded-lg border border-slate-700 p-3" data-testid="microphone-midi-reference">
        <summary className="cursor-pointer text-xs font-semibold text-slate-200">
          Дополнительно: синхронизированный MIDI-эталон
        </summary>
        <div className="space-y-2 mt-3 text-xs text-slate-400">
          <p>
            Только если MIDI создаётся <strong>тем же самым звучащим инструментом</strong>.
            Отдельный MIDI-контроллер не служит эталоном акустического пианино.
          </p>
          <button type="button" className={btn} disabled={running || busy}
            onClick={() => void requestMidi()}>
            <span className="inline-flex gap-1.5 items-center">
              <PlugZap className="w-3.5 h-3.5" aria-hidden="true"/> Подключить MIDI
            </span>
          </button>
          {midiError && <p role="alert" className="text-amber-300">{midiError}</p>}
          {midiPorts.length > 0 && (
            <>
              <label htmlFor="microphone-midi-port" className="block">MIDI-вход инструмента</label>
              <select id="microphone-midi-port" disabled={running || busy} value={midiPortId}
                onChange={event => {
                  const id=event.target.value;
                  attachMidi(id); setMidiPortId(id);setSameInstrument(false);
                }}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-2 text-slate-100">
                <option value="">Не использовать</option>
                {midiPorts.map(port => <option key={port.id} value={port.id}>{port.name}</option>)}
              </select>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={sameInstrument}
                  disabled={running || busy || !midiPortId}
                  onChange={event => setSameInstrument(event.target.checked)}/>
                <span>Подтверждаю: MIDI-сообщения приходят от этого же звучащего инструмента.</span>
              </label>
            </>
          )}
        </div>
      </details>
      <p className="text-[11px] text-slate-500">
        Без независимого MIDI-эталона точность и задержку нажатия клавиши определить нельзя.
        Даже при MIDI отчёт измеряет только интервал от его сообщения до ответа JavaScript,
        не акустическую задержку. Данные доступны лишь во время открытой сессии.
      </p>
    </div>
  );
};
