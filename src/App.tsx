import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { SettingsDrawer } from './components/layout/SettingsDrawer';
import { CourseWorkspace } from './components/workspaces/CourseWorkspace';
import { TrainerWorkspace } from './components/workspaces/TrainerWorkspace/TrainerWorkspace';
import { PrecheckWorkspace } from './components/workspaces/PrecheckWorkspace';
import { LabWorkspace } from './components/workspaces/LabWorkspace';
import { TheoryWorkspace } from './components/workspaces/TheoryWorkspace';

export const App: React.FC = () => {
  const { currentWorkspace, initApp } = useAppStore();

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
        {currentWorkspace === 'trainer' && <TrainerWorkspace />}
        {currentWorkspace === 'precheck' && <PrecheckWorkspace />}
        {currentWorkspace === 'lab' && <LabWorkspace />}
        {currentWorkspace === 'theory' && <TheoryWorkspace />}
      </main>

      {/* 3. Выдвижная панель настроек (Drawer) */}
      <SettingsDrawer />
    </div>
  );
};
