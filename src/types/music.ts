export type ClefType = 'treble' | 'bass';

export type AccidentalType = 'sharp' | 'flat' | null;

export type AppMode = 
  | 'reflex' 
  | 'rhythm' 
  | 'lookahead' 
  | 'photo' 
  | 'intervals' 
  | 'gpattern' 
  | 'blind' 
  | 'hanon';

export type FilterType = 'treble' | 'treble_oct2' | 'bass' | 'both';

export type TonalityKey = 'C' | 'G' | 'F' | 'D';

export type SpeechType = 'count' | 'tata' | 'syllables' | 'solfege';

export type HanonType = 'hanon1' | 'hanon2' | 'groups4' | 'coord';

export interface NoteDefinition {
  midi: number;
  freq: number;
  clef: ClefType;
  y: number;
  stepIdx: number;
  label: string;
  pcKey: string;
  isBlack: boolean;
  whiteIdx?: number;
  ledger?: number | false;
  accidental: AccidentalType;
  finger: number;
}

export type ExerciseNoteStatus = 'pending' | 'current' | 'done' | 'missed';

export interface ExerciseNote extends NoteDefinition {
  id: number;
  noteName: string;
  articulation: 'legato' | 'staccato';
  syllable: string;
  durMultiplier: number;
  status: ExerciseNoteStatus;
  group4?: number;
}

export interface IntervalInfo {
  name: string;
  rule: string;
}

export interface TonalitySign {
  type: '♯' | '♭';
  trebleY: number;
  bassY: number;
}

export interface TonalityConfig {
  name: string;
  signs: TonalitySign[];
  scaleNotes: string[];
}
