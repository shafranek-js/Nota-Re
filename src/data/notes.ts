import type { NoteDefinition } from '../types/music';

// Полная 3-октавная карта клавиш (C3 - B5)
const BASE_MIDI_NOTE_MAP: Record<string, NoteDefinition> = {
  'C3':  { midi: 48, freq: 130.81, clef: 'bass',   y: 215, stepIdx: 0,  label: 'До (C3)',   pcKey: 'z', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'C#3': { midi: 49, freq: 138.59, clef: 'bass',   y: 215, stepIdx: 0,  label: 'До♯ (C#3)', pcKey: 's', isBlack: true,  whiteIdx: 0,  accidental: 'sharp', finger: 4 },
  'D3':  { midi: 50, freq: 146.83, clef: 'bass',   y: 206, stepIdx: 1,  label: 'Ре (D3)',   pcKey: 'x', isBlack: false, ledger: false, accidental: null, finger: 4 },
  'D#3': { midi: 51, freq: 155.56, clef: 'bass',   y: 206, stepIdx: 1,  label: 'Ре♯ (D#3)', pcKey: 'd', isBlack: true,  whiteIdx: 1,  accidental: 'sharp', finger: 3 },
  'E3':  { midi: 52, freq: 164.81, clef: 'bass',   y: 197, stepIdx: 2,  label: 'Ми (E3)',   pcKey: 'c', isBlack: false, ledger: false, accidental: null, finger: 3 },
  'F3':  { midi: 53, freq: 174.61, clef: 'bass',   y: 188, stepIdx: 3,  label: 'Фа (F3)',   pcKey: 'v', isBlack: false, ledger: false, accidental: null, finger: 2 },
  'F#3': { midi: 54, freq: 185.00, clef: 'bass',   y: 188, stepIdx: 3,  label: 'Фа♯ (F#3)', pcKey: 'g', isBlack: true,  whiteIdx: 3,  accidental: 'sharp', finger: 2 },
  'G3':  { midi: 55, freq: 196.00, clef: 'bass',   y: 179, stepIdx: 4,  label: 'Соль (G3)', pcKey: 'b', isBlack: false, ledger: false, accidental: null, finger: 1 },
  'G#3': { midi: 56, freq: 207.65, clef: 'bass',   y: 179, stepIdx: 4,  label: 'Соль♯',     pcKey: 'h', isBlack: true,  whiteIdx: 4,  accidental: 'sharp', finger: 2 },
  'A3':  { midi: 57, freq: 220.00, clef: 'bass',   y: 170, stepIdx: 5,  label: 'Ля (A3)',   pcKey: 'n', isBlack: false, ledger: false, accidental: null, finger: 2 },
  'A#3': { midi: 58, freq: 233.08, clef: 'bass',   y: 161, stepIdx: 6,  label: 'Си♭ (Bb3)', pcKey: 'j', isBlack: true,  whiteIdx: 5,  accidental: 'flat',  finger: 2 },
  'B3':  { midi: 59, freq: 246.94, clef: 'bass',   y: 161, stepIdx: 6,  label: 'Си (B3)',   pcKey: 'm', isBlack: false, ledger: false, accidental: null, finger: 1 },

  'C4':  { midi: 60, freq: 261.63, clef: 'treble', y: 130, stepIdx: 7,  label: 'До (C4)',   pcKey: 'q', isBlack: false, ledger: 130,   accidental: null, finger: 1 },
  'C#4': { midi: 61, freq: 277.18, clef: 'treble', y: 130, stepIdx: 7,  label: 'До♯ (C#4)', pcKey: '2', isBlack: true,  whiteIdx: 7,  ledger: 130,   accidental: 'sharp', finger: 2 },
  'D4':  { midi: 62, freq: 293.66, clef: 'treble', y: 121, stepIdx: 8,  label: 'Ре (D4)',   pcKey: 'w', isBlack: false, ledger: false, accidental: null, finger: 2 },
  'D#4': { midi: 63, freq: 311.13, clef: 'treble', y: 121, stepIdx: 8,  label: 'Ре♯ (D#4)', pcKey: '3', isBlack: true,  whiteIdx: 8,  accidental: 'sharp', finger: 3 },
  'E4':  { midi: 64, freq: 329.63, clef: 'treble', y: 112, stepIdx: 9,  label: 'Ми (E4)',   pcKey: 'e', isBlack: false, ledger: false, accidental: null, finger: 3 },
  'F4':  { midi: 65, freq: 349.23, clef: 'treble', y: 103, stepIdx: 10, label: 'Фа (F4)',   pcKey: 'r', isBlack: false, ledger: false, accidental: null, finger: 4 },
  'F#4': { midi: 66, freq: 369.99, clef: 'treble', y: 103, stepIdx: 10, label: 'Фа♯ (F#4)', pcKey: '5', isBlack: true,  whiteIdx: 10, accidental: 'sharp', finger: 4 },
  'G4':  { midi: 67, freq: 392.00, clef: 'treble', y: 94,  stepIdx: 11, label: 'Соль (G4)', pcKey: 't', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'G#4': { midi: 68, freq: 415.30, clef: 'treble', y: 94,  stepIdx: 11, label: 'Соль♯',     pcKey: '6', isBlack: true,  whiteIdx: 11, accidental: 'sharp', finger: 3 },
  'A4':  { midi: 69, freq: 440.00, clef: 'treble', y: 85,  stepIdx: 12, label: 'Ля (A4)',   pcKey: 'y', isBlack: false, ledger: false, accidental: null, finger: 4 },
  'A#4': { midi: 70, freq: 466.16, clef: 'treble', y: 76,  stepIdx: 13, label: 'Си♭ (Bb4)', pcKey: '7', isBlack: true,  whiteIdx: 12, accidental: 'flat',  finger: 4 },
  'B4':  { midi: 71, freq: 493.88, clef: 'treble', y: 76,  stepIdx: 13, label: 'Си (B4)',   pcKey: 'u', isBlack: false, ledger: false, accidental: null, finger: 5 },

  'C5':  { midi: 72, freq: 523.25, clef: 'treble', y: 67,  stepIdx: 14, label: 'До (C5)',   pcKey: 'i', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'C#5': { midi: 73, freq: 554.37, clef: 'treble', y: 67,  stepIdx: 14, label: 'До♯ (C#5)', pcKey: '9', isBlack: true,  whiteIdx: 14, accidental: 'sharp', finger: 4 },
  'D5':  { midi: 74, freq: 587.33, clef: 'treble', y: 58,  stepIdx: 15, label: 'Ре (D5)',   pcKey: 'o', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'D#5': { midi: 75, freq: 622.25, clef: 'treble', y: 58,  stepIdx: 15, label: 'Ре♯ (D#5)', pcKey: '0', isBlack: true,  whiteIdx: 15, accidental: 'sharp', finger: 4 },
  'E5':  { midi: 76, freq: 659.25, clef: 'treble', y: 49,  stepIdx: 16, label: 'Ми (E5)',   pcKey: 'p', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'F5':  { midi: 77, freq: 698.46, clef: 'treble', y: 40,  stepIdx: 17, label: 'Фа (F5)',   pcKey: '[', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'F#5': { midi: 78, freq: 739.99, clef: 'treble', y: 40,  stepIdx: 17, label: 'Фа♯ (F#5)', pcKey: '=', isBlack: true,  whiteIdx: 17, accidental: 'sharp', finger: 4 },
  'G5':  { midi: 79, freq: 783.99, clef: 'treble', y: 31,  stepIdx: 18, label: 'Соль (G5)', pcKey: ']', isBlack: false, ledger: false, accidental: null, finger: 5 },
  'G#5': { midi: 80, freq: 830.61, clef: 'treble', y: 31,  stepIdx: 18, label: 'Соль♯',     pcKey: '',  isBlack: true,  whiteIdx: 18, accidental: 'sharp', finger: 4 },
  'A5':  { midi: 81, freq: 880.00, clef: 'treble', y: 22,  stepIdx: 19, label: 'Ля (A5)',   pcKey: '',  isBlack: false, ledger: 22,    accidental: null, finger: 5 },
  'A#5': { midi: 82, freq: 932.33, clef: 'treble', y: 22,  stepIdx: 19, label: 'Си♭ (Bb5)', pcKey: '',  isBlack: true,  whiteIdx: 19, accidental: 'flat',  finger: 4 },
  'B5':  { midi: 83, freq: 987.77, clef: 'treble', y: 13,  stepIdx: 20, label: 'Си (B5)',   pcKey: '',  isBlack: false, ledger: 22,    accidental: null, finger: 5 }
};

// A# and Bb are physically the same piano keys, but F major must preserve
// the B-flat spelling for note reading and labels. Keep the legacy A# aliases
// for keyboard geometry and existing shortcuts.
export const MIDI_NOTE_MAP: Record<string, NoteDefinition> = {
  ...BASE_MIDI_NOTE_MAP,
  Bb3: BASE_MIDI_NOTE_MAP['A#3'],
  Bb4: BASE_MIDI_NOTE_MAP['A#4'],
  Bb5: BASE_MIDI_NOTE_MAP['A#5']
};

export const WHITE_KEYS_ORDER = [
  'C3','D3','E3','F3','G3','A3','B3',
  'C4','D4','E4','F4','G4','A4','B4',
  'C5','D5','E5','F5','G5','A5','B5'
];

export const BLACK_KEYS_ORDER = [
  'C#3','D#3','F#3','G#3','A#3',
  'C#4','D#4','F#4','G#4','A#4',
  'C#5','D#5','F#5','G#5','A#5'
];
