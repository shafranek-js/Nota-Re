import React, { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import {
  clearRepertoireMeasureOverlay, drawRepertoireMeasureOverlay,
  locateEngravedMeasures, selectMeasureIndices,
  type EngravedRepertoireMeasure
} from '../../core/notation/repertoireMeasureGeometry';
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
    mappedMeasures.current = [];
    let parsedTimeline: MusicXmlTimelineResult | null = null;

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
            parsedTimeline = mapMusicXmlToScoreDocument(safe, info.title);
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
        setTimeline(parsedTimeline ?? { score: null, reason: 'Нотный движок не предоставил XML для структурного анализа.' });
        if (parsedTimeline?.score) {
          const result = locateEngravedMeasures(osmd, mount, parsedTimeline.score);
          mappedMeasures.current = result.measures;
          setGeometryMessage(result.reason);
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
                if (parsedTimeline?.score) {
                  const result = locateEngravedMeasures(osmd, mount, parsedTimeline.score);
                  mappedMeasures.current = result.measures;
                  setGeometryMessage(result.reason);
                }
                setRenderEpoch(value => value + 1);
              } catch (error) {
                mappedMeasures.current = [];
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
    if (!selectionActive || !timeline?.score || geometryMessage || !mappedMeasures.current.length) return;
    const selected = selectMeasureIndices(timeline.score, firstBar - 1, lastBar - 1);
    if (!selected) return;
    drawRepertoireMeasureOverlay(mount, mappedMeasures.current, selected, theme === 'light');
  }, [selectionActive, timeline, firstBar, lastBar, geometryMessage, renderEpoch, theme]);

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
                setLastBar(next);
              }}
              className="w-14 rounded border border-slate-600 bg-slate-800 px-1.5 py-1 text-slate-100" />
          </label>
          <button type="button" disabled={!!geometryMessage} onClick={() => setSelectionActive(true)}
            data-testid="repertoire-ab-show" className="rounded border border-sky-600 bg-sky-950/40 px-2 py-1 text-sky-200 disabled:opacity-50">
            Выделить
          </button>
          {selectionActive && <button type="button" onClick={() => setSelectionActive(false)}
            data-testid="repertoire-ab-clear" className="rounded border border-slate-600 px-2 py-1 text-slate-300">Снять</button>}
          <span className="text-slate-400">Только выделение · без воспроизведения</span>
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
