import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { readAppTheme, saveAppTheme } from './core/ui/themePreference';
import type { AppTheme } from './core/ui/themePreference';
import { isZenActive } from './core/training/zenMode';
import { SettingsDrawer } from './components/layout/SettingsDrawer';
import { StatusBar } from './components/layout/StatusBar';
import { readScoreRendererPreference, saveScoreRendererPreference } from './core/notation/scoreRendererPreference';
import type { ScoreRenderer } from './core/notation/scoreRendererPreference';
import { CourseWorkspace } from './components/workspaces/CourseWorkspace';
import { StudioWorkspace } from './components/workspaces/StudioWorkspace';
import { TheoryWorkspace } from './components/workspaces/TheoryWorkspace';

export const App: React.FC = () => {
  const { currentWorkspace, studioSection, initApp, trainerPhase, isTwoHandPracticeOpen, zenModeEnabled } = useAppStore();
  const zenActive = isZenActive({ currentWorkspace, studioSection, trainerPhase, isTwoHandPracticeOpen, zenModeEnabled });
  const [scoreRenderer, setScoreRenderer] = useState<ScoreRenderer>(readScoreRendererPreference);
  const [theme, setTheme] = useState<AppTheme>(readAppTheme);

  const selectScoreRenderer = (renderer: ScoreRenderer) => {
    saveScoreRendererPreference(renderer);
    setScoreRenderer(renderer);
  };

  useEffect(() => {
    return initApp();
  }, [initApp]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveAppTheme(theme);
  }, [theme]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#060a12] text-slate-100">
      {/* 1. Полноширинная шапка */}
      {!zenActive && <Header theme={theme} onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} />}

      {/* 2. Активное рабочее пространство */}
      <main className="flex-1 min-h-0 w-full overflow-y-auto lg:overflow-hidden flex flex-col">
        {currentWorkspace === 'course' && <CourseWorkspace />}
        {currentWorkspace === 'trainer' && (
          <StudioWorkspace renderer={scoreRenderer} onSelectRenderer={selectScoreRenderer} zenActive={zenActive} />
        )}
        {currentWorkspace === 'theory' && <TheoryWorkspace />}
      </main>

      {/* Technical information is always available, independent of the workspace. */}
      <StatusBar renderer={scoreRenderer} />

      {/* 3. Выдвижная панель настроек (Drawer) */}
      <SettingsDrawer />
    </div>
  );
};
