import { AppMode, FilterType, SpeechType, TonalityKey } from './music';

export interface LessonPreset {
  mode: AppMode;
  filter: FilterType;
  tonality: TonalityKey;
  bpm: number;
  flow: boolean;
  speech: SpeechType;
  blind: boolean;
  bassLandmarks: boolean;
}

export interface CourseLesson {
  id: number;
  module: string;
  moduleColor: 'emerald' | 'amber' | 'sky' | 'rose';
  timecode: string;
  title: string;
  theory: string;
  books: string;
  steps: string[];
  normReps: number;
  normAcc: number;
  normSpeed: number;
  preset: LessonPreset;
}
