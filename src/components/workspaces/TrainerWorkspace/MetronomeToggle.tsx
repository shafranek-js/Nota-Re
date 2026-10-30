import React from 'react';
import { Timer } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';

/** Optional click sound; independent of the grade and note clock. */
export const MetronomeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { metronomeEnabled, audioEnabled, toggleMetronome } = useAppStore();
  const title = !audioEnabled ? 'Метроном: общий звук выключен'
    : metronomeEnabled ? 'Выключить щелчки метронома' : 'Включить щелчки метронома';
  return (
    <button type="button" data-testid="metronome-toggle" aria-label="Звук метронома"
      aria-pressed={metronomeEnabled} onClick={toggleMetronome} title={title}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
        metronomeEnabled ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
          : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-sky-600'
      }`}>
      <Timer aria-hidden="true" className="h-3.5 w-3.5" />
      {compact ? <span className="sr-only">Звук метронома</span> : (
        <span>Метроном: {metronomeEnabled ? 'Вкл' : 'Выкл'}</span>
      )}
    </button>
  );
};
