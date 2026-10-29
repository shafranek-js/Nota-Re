import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { SettingsDrawer } from './components/layout/SettingsDrawer';
import { StatusBar } from './components/layout/StatusBar';
import { readScoreRendererPreference, saveScoreRendererPreference } from './core/notation/scoreRendererPreference';
import type { ScoreRenderer } from './core/notation/scoreRendererPreference';
import { CourseWorkspace } from './components/workspaces/CourseWorkspace';
import { TrainerWorkspace } from './components/workspaces/TrainerWorkspace/TrainerWorkspace';
import { PrecheckWorkspace } from './components/workspaces/PrecheckWorkspace';
import { LabWorkspace } from './components/workspaces/LabWorkspace';
import { TheoryWorkspace } from './components/workspaces/TheoryWorkspace';

export const App: React.FC = () => {
  const { currentWorkspace, initApp } = useAppStore();
  const [scoreRenderer, setScoreRenderer] = useState<ScoreRenderer>(readScoreRendererPreference);

  const selectScoreRenderer = (renderer: ScoreRenderer) => {
    saveScoreRendererPreference(renderer);
    setScoreRenderer(renderer);
  };

  useEffect(() => {
    return initApp();
  }, [initApp]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#060a12] text-slate-100">
      {/* 1. Полноширинная шапка */}
      <Header />

      {/* 2. Активное рабочее пространство */}
      <main className="flex-1 min-h-0 w-full overflow-y-auto lg:overflow-hidden flex flex-col">
        {currentWorkspace === 'course' && <CourseWorkspace />}
        {currentWorkspace === 'trainer' && (
          <TrainerWorkspace renderer={scoreRenderer} onSelectRenderer={selectScoreRenderer} />
        )}
        {currentWorkspace === 'precheck' && <PrecheckWorkspace />}
        {currentWorkspace === 'lab' && <LabWorkspace />}
        {currentWorkspace === 'theory' && <TheoryWorkspace />}
      </main>

      {/* Technical information is always available, independent of the workspace. */}
      <StatusBar renderer={scoreRenderer} />

      {/* 3. Выдвижная панель настроек (Drawer) */}
      <SettingsDrawer />
    </div>
  );
};
