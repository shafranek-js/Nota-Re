import React from 'react';
import type { ScoreRenderer } from '../../core/notation/scoreRendererPreference';
import { useAppStore, type StudioSection } from '../../store/useAppStore';
import { TrainerWorkspace } from './TrainerWorkspace/TrainerWorkspace';
import { PrecheckWorkspace } from './PrecheckWorkspace';
import { LabWorkspace } from './LabWorkspace';

interface StudioWorkspaceProps {
  renderer: ScoreRenderer;
  onSelectRenderer: (renderer: ScoreRenderer) => void;
  zenActive: boolean;
}

const sections: readonly { id: StudioSection; title: string; detail: string }[] = [
  { id: 'practice', title: 'Практика', detail: 'Нотный стан, MIDI и все восемь режимов' },
  { id: 'precheck', title: 'Подготовка', detail: 'Пять шагов анализа и кварто-квинтовый круг' },
  { id: 'lab', title: 'Лаборатория', detail: 'Ганон, Черни, штрихи и ритмослоги' }
];

/**
 * Secondary destinations share the same Studio entry instead of occupying
 * top-level navigation. They reuse the existing, independently tested cards.
 * Entering a reference section safely interrupts any graded audio deadlines.
 */
export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  renderer, onSelectRenderer, zenActive
}) => {
  const { studioSection, switchStudioSection } = useAppStore();

  return (
    <div className="flex-1 min-h-0 w-full min-w-0 flex flex-col" data-testid="studio-root">
      {!zenActive && (
        <nav aria-label="Разделы Студии"
          className="shrink-0 min-w-0 px-2 pt-1.5 flex items-center gap-1 overflow-x-auto whitespace-nowrap custom-scroll">
          {sections.map(section => {
            const selected = studioSection === section.id;
            return (
              <button type="button" key={section.id}
                data-testid={`studio-section-${section.id}`}
                aria-current={selected ? 'page' : undefined}
                title={section.detail}
                onClick={() => switchStudioSection(section.id)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  selected ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                }`}>
                {section.title}
              </button>
            );
          })}
        </nav>
      )}
      {studioSection === 'practice' && (
        <TrainerWorkspace renderer={renderer} onSelectRenderer={onSelectRenderer} />
      )}
      {studioSection === 'precheck' && <PrecheckWorkspace />}
      {studioSection === 'lab' && <LabWorkspace />}
    </div>
  );
};
