import React from 'react';
import { TrainerBanner } from './TrainerBanner';
import { TrainerToolbar } from './TrainerToolbar';
import { GrandStaffSvg } from './GrandStaffSvg';
import { TargetInfoBar } from './TargetInfoBar';
import { PianoKeyboard } from './PianoKeyboard';

export const TrainerWorkspace: React.FC = () => {
  return (
    <section className="flex-1 min-h-0 w-full flex flex-col justify-between p-2 gap-1.5 overflow-hidden">
      {/* 1. Полоса активного урока курса (контроль норматива) */}
      <TrainerBanner />

      {/* 2. Верхняя панель инструментов: 8 режимов + сборники + темп */}
      <TrainerToolbar />

      {/* 3. Центральная зона: Панорамный нотный стан + Телеметрия */}
      <div className="flex-1 min-h-0 w-full flex flex-col justify-between overflow-hidden">
        <GrandStaffSvg />
        <TargetInfoBar />
      </div>

      {/* 4. Нижняя зона: Полноширинная клавиатура фортепиано (C3-B5) */}
      <PianoKeyboard />
    </section>
  );
};
