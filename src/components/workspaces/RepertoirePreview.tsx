import React, { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { audioEngine } from '../../core/audio/AudioEngine';
import { buildScoreLoopAudio } from '../../core/notation/scoreLoopAudio';
import { inspectRepertoireCapabilities } from '../../core/notation/repertoireCapabilities';
import {
  clearRepertoireMeasureOverlay, drawRepertoireMeasureOverlay,
  locateEngravedMeasures, selectMeasureIndices,
  type EngravedRepertoireMeasure
} from '../../core/notation/repertoireMeasureGeometry';
import { clearRepertoireNoteOverlay, drawRepertoireNoteOverlay,
  mapRepertoireNoteheads, type RepertoireNoteMapping
} from '../../core/notation/repertoireNoteGeometry';
import type { AppTheme } from '../../core/ui/themePreference';
import { mapMusicXmlToScoreDocument, type MusicXmlTimelineResult } from '../../core/notation/musicXmlTimelineAdapter';
import { inspectMusicXmlText, sanitizedRepertoireXml, MAX_EXPANDED_BYTES,
  type RepertoireFileInfo } from '../../core/notation/repertoireImport';

interface Props {
  info: RepertoireFileInfo;
  theme: AppTheme;
  onClose: () => void;
  onReplace: () => void;
}

/**
 * Read-only OSMD instance, isolated from exercise generation, training modes,
 * MIDI grading and the course completion state.
 */
export const RepertoirePreview: React.FC<Props> = ({ info, theme, onClose, onReplace }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [timeline, setTimeline] = useState<MusicXmlTimelineResult | null>(null);
  const [firstBar, setFirstBar] = useState(1);
  const [lastBar, setLastBar] = useState(1);
  const [selectionActive, setSelectionActive] = useState(false);
  const [loopPlaying, setLoopPlaying] = useState(false);
  const [loopError, setLoopError] = useState('');
  const loopOwned = useRef(false);
  const stopLoop = () => {
    if (loopOwned.current) audioEngine.clearPreviewTimeouts();
    loopOwned.current = false;
    setLoopPlaying(false);
  };
  useEffect(() => () => {
    if (loopOwned.current) audioEngine.clearPreviewTimeouts();
    loopOwned.current = false;
  }, []);
  useEffect(() => {
    const stopOnHidden = () => { if (document.hidden && loopOwned.current) stopLoop(); };
    document.addEventListener('visibilitychange', stopOnHidden);
    return () => document.removeEventListener('visibilitychange', stopOnHidden);
  }, []);
  const playLoop = async () => {
    if (!timeline?.score || !selectionActive || geometryMessage) return;
    stopLoop();
    setLoopError('');
    try {
      const range = selectMeasureIndices(timeline.score, firstBar - 1, lastBar - 1);
      if (!range) throw new Error('Выберите корректный диапазон тактов A–B.');
      const { tones, periodSeconds } = buildScoreLoopAudio(timeline.score, range);
      if (!tones.length) throw new Error('В этом диапазоне нет звучащих нот.');
      if (!audioEngine.getAudioEnabled()) throw new Error('Включите звук в верхней панели.');
      const context = audioEngine.ensureAudioContext();
      if (!context) throw new Error('Браузер не поддерживает Web Audio.');
      await context.resume();
      if (context.state !== 'running') throw new Error('Не удалось запустить AudioContext.');
      if (!audioEngine.playLoopedPreview(tones, periodSeconds)) {
        throw new Error('Не удалось запустить воспроизведение.');
      }
      loopOwned.current = true;
      setLoopPlaying(true);
    } catch (error) {
      stopLoop();
      setLoopError(error instanceof Error ? error.message : 'Ошибка воспроизведения.');
    }
  };
  const [noteAnchorsVisible, setNoteAnchorsVisible] = useState(false);
  const [noteMapping, setNoteMapping] = useState<RepertoireNoteMapping | null>(null);
  const [geometryMessage, setGeometryMessage] = useState<string | null>(null);
  const [renderEpoch, setRenderEpoch] = useState(0);
  const mappedMeasures = useRef<readonly EngravedRepertoireMeasure[]>([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let osmdInstance: OpenSheetMusicDisplay | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
    mount.replaceChildren();
    setState('loading');
    setMessage('');
    setTimeline(null);
    setGeometryMessage(null);
    setNoteMapping(null);
    mappedMeasures.current = [];
    if (loopOwned.current) {
      audioEngine.clearPreviewTimeouts();
      loopOwned.current = false;
      setLoopPlaying(false);
    }
    const parsed = { timeline: null as MusicXmlTimelineResult | null };

    (async () => {
      try {
        const osmd = new OpenSheetMusicDisplay(mount, {
          autoResize: false,
          backend: 'svg',
          // The file header already shows the title. OSMD's page title can
          // overflow narrow SVG viewports and duplicates the file metadata.
          drawTitle: false,
          drawSubtitle: false,
          darkMode: theme === 'dark',
          // This also validates decompressed XML from MXL, not just plain files.
          onXMLRead: xml => {
            if (xml.length > MAX_EXPANDED_BYTES) {
              throw new Error('Распакованная партитура слишком велика.');
            }
            const safe = sanitizedRepertoireXml(xml);
            inspectMusicXmlText(safe);
            // Map the same sanitized XML passed to OSMD. Unsupported notation
            // remains renderable and is never silently made assessable.
            parsed.timeline = mapMusicXmlToScoreDocument(safe, info.title);
            return safe;
          }
        });
        osmdInstance = osmd;
        const rules = osmd.EngravingRules;
        const dark = theme === 'dark';
        const ink = dark ? '#f8fafc' : '#0f172a';
        rules.PageBackgroundColor = dark ? '#0b1120' : '#ffffff';
        rules.DefaultColorMusic = ink;
        rules.DefaultColorNotehead = ink;
        rules.DefaultColorStem = ink;
        rules.DefaultColorRest = dark ? '#94a3b8' : '#475569';
        rules.DefaultColorLabel = dark ? '#94a3b8' : '#475569';
        rules.StaffLineColor = dark ? '#334155' : '#64748b';

        // File (not a blob URL, UTF-8-decoded ZIP or transformed score) enables
        // OSMD's built-in MXL rootfile resolution, without JSZip duplication.
        await osmd.load(info.file, info.title);
        if (cancelled) return;
        osmd.render();
        if (cancelled) return;
        if (!mount.querySelector('svg')) throw new Error('Нотный движок не вернул SVG партитуры.');
        setTimeline(parsed.timeline ?? { score: null, reason: 'Нотный движок не предоставил XML для структурного анализа.' });
        if (parsed.timeline?.score) {
          const result = locateEngravedMeasures(osmd, mount, parsed.timeline.score);
          mappedMeasures.current = result.measures;
          setGeometryMessage(result.reason);
          setNoteMapping(result.reason ? {
            anchors: [], total: parsed.timeline.score.events.filter(event => event.kind === 'note').length,
            reason: result.reason
          } : mapRepertoireNoteheads(osmd, mount, parsed.timeline.score, result.measures));
        }
        setRenderEpoch(value => value + 1);
        let lastWidth = mount.clientWidth;
        resizeObserver = new ResizeObserver(() => {
          const width = mount.clientWidth;
          if (cancelled || width <= 100 || Math.abs(width - lastWidth) <= 2) return;
          lastWidth = width;
          window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            if (!cancelled) {
              try {
                osmd.render();
                if (parsed.timeline?.score) {
                  const result = locateEngravedMeasures(osmd, mount, parsed.timeline.score);
                  mappedMeasures.current = result.measures;
                  setGeometryMessage(result.reason);
                  setNoteMapping(result.reason ? {
                    anchors: [], total: parsed.timeline.score.events.filter(event => event.kind === 'note').length,
                    reason: result.reason
                  } : mapRepertoireNoteheads(osmd, mount, parsed.timeline.score, result.measures));
                }
                setRenderEpoch(value => value + 1);
              } catch (error) {
                mappedMeasures.current = [];
                setNoteMapping(null);
                setGeometryMessage('Ошибка измерения геометрии OSMD после изменения размера.');
                console.warn('Repertoire resize failed', error);
              }
            }
          });
        });
        resizeObserver.observe(mount);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('Repertoire preview failed', err);
        setState('error');
        setMessage('Не удалось открыть партитуру. Проверьте MusicXML/MXL, голоса и структуру файла.');
      }
    })();

    return () => {
      cancelled = true;
      mappedMeasures.current = [];
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      // No public OSMD dispose; avoid autoResize global listeners and release
      // cursor/backend resources explicitly on close, replacement and theme change.
      try { osmdInstance?.cursor?.Dispose(); } catch { /* cursor may be absent */ }
      try { osmdInstance?.clear(); } catch { /* renderer may still be loading */ }
      mount.replaceChildren();
    };
  }, [info, theme]);

  // Renderer and ScoreDocument are both checked before a single highlight is
  // drawn. A missing mapping never guesses at SVG order or evaluates notes.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    clearRepertoireMeasureOverlay(mount);
    clearRepertoireNoteOverlay(mount);
    if (!selectionActive || !timeline?.score || geometryMessage || !mappedMeasures.current.length) return;
    const selected = selectMeasureIndices(timeline.score, firstBar - 1, lastBar - 1);
    if (!selected) return;
    drawRepertoireMeasureOverlay(mount, mappedMeasures.current, selected, theme === 'light');
    if (noteAnchorsVisible && noteMapping && !noteMapping.reason) {
      drawRepertoireNoteOverlay(mount, noteMapping, selected, theme === 'light');
    }
  }, [selectionActive, timeline, firstBar, lastBar, geometryMessage,
      renderEpoch, theme, noteAnchorsVisible, noteMapping]);

  // Report what this *specific* file and OSMD rendering prove. A rendered
  // score does not imply exact note identities or grading eligibility.
  const capabilities = state === 'ready' ? inspectRepertoireCapabilities({
    rendered: renderEpoch > 0,
    score: timeline?.score ?? null,
    parsingReason: timeline?.reason ?? null,
    measureGeometryReady: !!timeline?.score &&
      mappedMeasures.current.length === timeline.score.measures.length,
    measureGeometryReason: geometryMessage,
    noteMapping: noteMapping
      ? { matched: noteMapping.anchors.length, total: noteMapping.total, reason: noteMapping.reason }
      : null
  }) : [];
  const supports = (key: typeof capabilities[number]['key']) =>
    capabilities.some(feature => feature.key === key && feature.available);

  return (
    <section data-testid="repertoire-preview" aria-label="Просмотр загруженной партитуры"
      className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden p-2">
      <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-slate-100 break-words">{info.title}</strong>
            <span className="rounded border border-amber-600/50 bg-amber-950/30 px-2 py-0.5 text-xs text-amber-300">Только просмотр · без зачёта</span>
          </div>
          <p className="text-xs text-slate-400 break-all">{info.file.name}
            {info.parts !== null ? ` · ${info.parts} партий` : ''}
            {info.measures !== null ? ` · ${info.measures} тактов (всего по партиям)` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onReplace}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:border-sky-400">
            Другой файл
          </button>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:border-sky-400">
            Вернуться к упражнению
          </button>
        </div>
      </div>
      <p className="shrink-0 text-xs text-slate-400">
        Файл обрабатывается локально. MIDI-оценка и зачёт отключены.
        {state === 'ready' && timeline && (
          <span data-testid="repertoire-timeline" role="status"
            data-meters={timeline.score?.measures.map(m => m.meter.beats + '/' + m.meter.beatType).join(' ') ?? ''}
            data-ties={timeline.score?.events.filter(event => event.tieToId).length ?? 0}
            data-voices={timeline.score
              ? new Set(timeline.score.events.map(event => event.partId + ':' + event.staff + ':' + event.voice)).size
              : 0}
            className={`ml-1 ${timeline.score ? 'text-sky-300' : 'text-amber-300'}`}
            title={timeline.reason ?? 'Музыкальная структура распознана, но оценка исполнения отключена'}>
            {timeline.score
              ? `Структура распознана: ${timeline.score.measures.length} такт. · ${timeline.score.events.filter(event => event.kind === 'note').length} нот · ${timeline.score.parts.length} парт. · без зачёта`
              : `Структурный разбор недоступен: ${timeline.reason}. Просмотр нот доступен.`}
          </span>
        )}
      </p>
      {state === 'ready' && (
        <details data-testid="repertoire-capabilities"
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-900/80 text-xs text-slate-200">
          <summary className="cursor-pointer px-3 py-1.5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            Возможности партитуры · {capabilities.filter(item => item.available).length} из 5 · зачёт отключён
          </summary>
          <ul className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto border-t border-slate-700 px-3 py-2 sm:grid-cols-2">
            {capabilities.map(item => (
              <li key={item.key} data-repertoire-capability={item.key}
                data-available={item.available ? 'true' : 'false'}>
                <strong className={item.available ? 'text-emerald-300' : 'text-amber-300'}>
                  {item.available ? 'Доступно' : 'Недоступно'} · {item.label}
                </strong>
                <p className="text-slate-400">{item.explanation}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {state === 'ready' && timeline?.score && (
        <div data-testid="repertoire-ab-controls"
          className="shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/30 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
          <strong className="text-sky-300">Такты A–B</strong>
          <label className="inline-flex items-center gap-1">
            A
            <input aria-label="Начальный такт A" type="number" min={1} max={timeline.score.measures.length}
              value={firstBar} onChange={event => {
                const next = Number(event.target.value);
                if (!Number.isSafeInteger(next) || next < 1 || next > timeline.score!.measures.length) return;
                stopLoop();
                setLoopError('');
                setFirstBar(next);
                setLastBar(old => Math.max(old, next));
              }}
              className="w-14 rounded border border-slate-600 bg-slate-800 px-1.5 py-1 text-slate-100" />
          </label>
          <label className="inline-flex items-center gap-1">
            B
            <input aria-label="Конечный такт B" type="number" min={firstBar} max={timeline.score.measures.length}
              value={lastBar} onChange={event => {
                const next = Number(event.target.value);
                if (!Number.isSafeInteger(next) || next < firstBar || next > timeline.score!.measures.length) return;
                stopLoop();
                setLoopError('');
                setLastBar(next);
              }}
              className="w-14 rounded border border-slate-600 bg-slate-800 px-1.5 py-1 text-slate-100" />
          </label>
          <button type="button" disabled={!supports('measure-selection')} onClick={() => { stopLoop(); setSelectionActive(true); }}
            data-testid="repertoire-ab-show" className="rounded border border-sky-600 bg-sky-950/40 px-2 py-1 text-sky-200 disabled:opacity-50">
            Выделить
          </button>
          {selectionActive && <button type="button" onClick={() => { stopLoop(); setSelectionActive(false); }}
            data-testid="repertoire-ab-clear" className="rounded border border-slate-600 px-2 py-1 text-slate-300">Снять</button>}
          <button type="button" data-testid="repertoire-note-anchors"
            disabled={!supports('notehead-overlay') || !selectionActive}
            onClick={() => setNoteAnchorsVisible(value => !value)}
            title={noteMapping?.reason ?? 'Кружками выделяются только однозначно сопоставленные нотные головки'}
            className="rounded border border-slate-600 px-2 py-1 text-sky-200 disabled:cursor-not-allowed disabled:opacity-50">
            {noteAnchorsVisible ? 'Скрыть ноты' : 'Показать ноты'}
          </button>
          <span data-testid="repertoire-anchor-coverage" role="status"
            className={noteMapping && !noteMapping.reason ? 'text-sky-300' : 'text-amber-300'}>
            {noteMapping
              ? noteMapping.reason
                ? 'Привязка нот недоступна: ' + noteMapping.reason
                : 'Ноты: ' + noteMapping.anchors.length + '/' + noteMapping.total
              : 'Проверка нот…'}
          </span>
          <button type="button" data-testid="repertoire-loop-toggle"
            disabled={!selectionActive || !supports('audio-loop')}
            onClick={() => { if (loopPlaying) stopLoop(); else void playLoop(); }}
            className="rounded border border-emerald-600/60 bg-emerald-950/30 px-2 py-1 font-medium text-emerald-200 disabled:opacity-50">
            {loopPlaying ? '■ Стоп A–B' : '▶ Повтор A–B'}
          </button>
          <span role="status" data-testid="repertoire-loop-status"
            className={loopPlaying ? 'text-emerald-300' : 'text-slate-400'}>
            {loopPlaying ? 'Повторяется · без зачёта' : 'Воспроизведение без оценки · темп по партитуре (иначе 80 BPM)'}
          </span>
          {loopError && <span role="alert" data-testid="repertoire-loop-error"
            className="text-rose-300">{loopError}</span>}
          {geometryMessage && <span role="status" data-testid="repertoire-ab-unavailable"
            className="text-amber-300">Подсветка недоступна: {geometryMessage}</span>}
        </div>
      )}
      {info.warnings.length > 0 && (
        <div role="note" className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          {info.warnings.join(' ')}
        </div>
      )}
      {state === 'loading' && <p role="status" className="shrink-0 text-sm text-sky-300">Загрузка и гравировка партитуры…</p>}
      {state === 'error' && <p role="alert" className="shrink-0 rounded-lg border border-rose-500/50 bg-rose-950/20 p-3 text-sm text-rose-300">{message}</p>}
      <div data-testid="repertoire-score-scroll" className={`${theme === 'light' ? 'osmd-light-theme' : 'osmd-dark-theme'} flex-1 min-h-0 overflow-auto rounded-xl border border-slate-700 bg-slate-950 text-slate-100`}>
        <div data-testid="repertoire-score" ref={mountRef} className="w-full min-w-[280px] p-2" />
      </div>
    </section>
  );
};
