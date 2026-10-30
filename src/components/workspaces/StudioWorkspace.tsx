import React, { Suspense, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { inspectRepertoireFile, type RepertoireFileInfo } from '../../core/notation/repertoireImport';
import type { ScoreRenderer } from '../../core/notation/scoreRendererPreference';
import type { AppTheme } from '../../core/ui/themePreference';
import { useAppStore, type StudioSection } from '../../store/useAppStore';
import { TrainerWorkspace } from './TrainerWorkspace/TrainerWorkspace';
import { PrecheckWorkspace } from './PrecheckWorkspace';
import { LabWorkspace } from './LabWorkspace';

interface StudioWorkspaceProps {
  renderer: ScoreRenderer;
  onSelectRenderer: (renderer: ScoreRenderer) => void;
  zenActive: boolean;
  theme: AppTheme;
}

const RepertoirePreview = React.lazy(() => import('./RepertoirePreview').then(
  module => ({ default: module.RepertoirePreview })
));

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
  renderer, onSelectRenderer, zenActive, theme
}) => {
  const { studioSection, switchStudioSection, trainerPhase, isTwoHandPracticeOpen } = useAppStore();
  const pickerRef = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const [repertoire, setRepertoire] = useState<RepertoireFileInfo | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  // View-only browsing is available only before a graded attempt begins.
  const canImport = studioSection === 'practice' && trainerPhase === 'setup' && !isTwoHandPracticeOpen;

  const openPicker = () => pickerRef.current?.click();

  const importFile = async (file: File) => {
    if (!canImport) return;
    const sequence = ++importSequence.current;
    setImportBusy(true);
    setImportError('');
    try {
      const info = await inspectRepertoireFile(file);
      if (sequence !== importSequence.current) return;
      setRepertoire(info);
    } catch (error) {
      if (sequence !== importSequence.current) return;
      setImportError(error instanceof Error ? error.message : 'Не удалось прочитать файл.');
    } finally {
      if (sequence === importSequence.current) setImportBusy(false);
    }
  };

  const closeRepertoire = () => {
    importSequence.current += 1;
    setRepertoire(null);
    setImportError('');
    setImportBusy(false);
  };

  return (
    <div className="flex-1 min-h-0 w-full min-w-0 flex flex-col" data-testid="studio-root"
      onDragOver={event => { if (canImport) event.preventDefault(); }}
      onDrop={event => {
        if (!canImport) return;
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files.length !== 1) {
          setImportError('Перетащите один файл MusicXML или MXL за раз.');
          return;
        }
        void importFile(files[0]);
      }}>
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
          {studioSection === 'practice' && (
            <div className="ml-auto shrink-0 flex items-center gap-2">
              <input type="file" ref={pickerRef} className="sr-only"
                data-testid="repertoire-file-input"
                aria-label="Выбрать партитуру MusicXML или MXL"
                accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
                disabled={!canImport}
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void importFile(file);
                }} />
              <button type="button" onClick={openPicker} disabled={!canImport || importBusy}
                data-testid="repertoire-upload"
                title={canImport ? 'Загрузить файл или перетащить его в Студию. Только просмотр.' :
                  'Импорт доступен после завершения текущего упражнения.'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
                <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                {importBusy ? 'Проверка файла…' : 'Загрузить репертуар'}
              </button>
            </div>
          )}
        </nav>
      )}
      {studioSection === 'practice' && importError && (
        <div role="alert" data-testid="repertoire-import-error"
          className="mx-2 mt-1 rounded-lg border border-rose-500/50 bg-rose-950/20 p-2 text-xs text-rose-300">
          {importError}
        </div>
      )}
      {studioSection === 'practice' && (repertoire ? (
        <Suspense fallback={<div role="status" className="p-4 text-sm text-slate-400">Подключение нотного движка…</div>}>
          <RepertoirePreview key={repertoire.file.name + ':' + repertoire.file.size}
            info={repertoire} theme={theme} onClose={closeRepertoire} onReplace={openPicker} />
        </Suspense>
      ) : (
        <TrainerWorkspace renderer={renderer} onSelectRenderer={onSelectRenderer} theme={theme} />
      ))}
      {studioSection === 'precheck' && <PrecheckWorkspace />}
      {studioSection === 'lab' && <LabWorkspace />}
    </div>
  );
};
