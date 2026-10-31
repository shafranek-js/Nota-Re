import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { ExerciseScore } from '../../core/notation/musicXml.ts';
import { toMusicXml } from '../../core/notation/musicXml.ts';

interface Props {
  readonly score: ExerciseScore;
  readonly testId?: string;
  readonly ariaLabel?: string;
}

/**
 * Deliberately isolated OSMD instance: no trainer overlays, note targets,
 * preset labels, keyboard highlights or MIDI hints can reveal the solution.
 * Score title is generic in both the DOM and the MusicXML payload.
 */
export const ModuleVInversionScore: React.FC<Props> = ({ score, testId = 'module-v-v2-score', ariaLabel = 'Нотная вертикаль на стане. Определите обращение трезвучия по расположению нот.' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const xml = useMemo(() => toMusicXml(score, {
    hideInactiveStaffRests: true,
    hideGeneratedRests: true
  }), [score]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let renderer: OpenSheetMusicDisplay | null = null;
    let observer: ResizeObserver | null = null;
    let lastWidth = mount.clientWidth;
    let busy = false;
    let rerender = false;
    setState('loading');
    mount.replaceChildren();

    const draw = async () => {
      if (!renderer || cancelled) return;
      if (busy) { rerender = true; return; }
      busy = true;
      try {
        renderer.zoom = Math.max(0.8, Math.min(1.18, mount.clientWidth / 620));
        await renderer.render();
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      } finally {
        busy = false;
        if (rerender && !cancelled) {
          rerender = false;
          void draw();
        }
      }
    };

    const start = async () => {
      try {
        const { OpenSheetMusicDisplay: OSMD } = await import('opensheetmusicdisplay');
        if (cancelled) return;
        renderer = new OSMD(mount, {
          backend: 'svg',
          darkMode: true,
          autoResize: false,
          drawingParameters: 'compacttight',
          drawTitle: false,
          drawPartNames: false,
          drawComposer: false
        });
        await renderer.load(xml);
        if (cancelled) return;
        await draw();
        observer = new ResizeObserver(() => {
          const width = mount.clientWidth;
          if (width < 50 || Math.abs(width - lastWidth) < 3) return;
          lastWidth = width;
          void draw();
        });
        observer.observe(mount);
      } catch {
        if (!cancelled) setState('error');
      }
    };
    void start();
    return () => {
      cancelled = true;
      observer?.disconnect();
      mount.replaceChildren();
    };
  }, [xml]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-2 sm:p-3">
      <div data-testid={testId}
        role="img" aria-label={ariaLabel}
        className="min-w-0 w-full overflow-x-auto">
        <div ref={mountRef} className="w-full min-h-[165px]" aria-hidden="true"/>
      </div>
      {state === 'loading' && <p data-testid="module-v-v2-loading"
        className="text-xs text-slate-400" role="status">Подготовка нотного стана…</p>}
      {state === 'error' && <p data-testid="module-v-v2-error"
        className="text-xs text-rose-300" role="alert">Не удалось показать ноты. Перейдите к следующему примеру.</p>}
    </div>
  );
};
