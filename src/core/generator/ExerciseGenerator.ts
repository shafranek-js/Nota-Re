import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { HANON_1_SEQ, HANON_2_SEQ, GROUPS_4_SEQ, COORD_SEQ } from '../../data/hanon.ts';
import type { AppMode, ExerciseNote, FilterType, HanonType, IntervalInfo, TonalityKey } from '../../types/music';

export function applyTonalityToPitch(noteName: string, tonality: TonalityKey): string {
  const pitch = noteName.slice(0, -1);
  const oct = noteName.slice(-1);
  if (tonality === 'G' && pitch === 'F') return `F#${oct}`;
  if (tonality === 'F' && pitch === 'B') return `Bb${oct}`;
  if (tonality === 'D') {
    if (pitch === 'F') return `F#${oct}`;
    if (pitch === 'C') return `C#${oct}`;
  }
  return noteName;
}

export function computeIntervalInfo(prevNote?: ExerciseNote | null, currNote?: ExerciseNote | null): IntervalInfo {
  if (!prevNote || !currNote) {
    return { name: 'Прима (старт)', rule: 'Опорная нота' };
  }
  const diff = Math.abs(currNote.stepIdx - prevNote.stepIdx);
  const dir = currNote.midi > prevNote.midi ? '↑' : (currNote.midi < prevNote.midi ? '↓' : '→');
  const map: Record<number, { name: string; rule: string }> = {
    0: { name: 'Прима (1)', rule: 'Та же линейка/окошко' },
    1: { name: `Секунда (2 ${dir})`, rule: 'Линия ➔ Окошко (соседний палец)' },
    2: { name: `Терция (3 ${dir})`, rule: 'Линия ➔ Линия (через палец!)' },
    3: { name: `Кварта (4 ${dir})`, rule: 'Линия ➔ Окошко (через 2 ступени)' },
    4: { name: `Квинта (5 ${dir})`, rule: 'Линия ➔ Линия (края 5 пальцев 1➔5)' }
  };
  return map[diff] || { name: `Скачок (${diff + 1} ${dir})`, rule: 'Широкий интервал' };
}

export interface GenerateOptions {
  mode: AppMode;
  filter: FilterType;
  tonality: TonalityKey;
  scoreNoteCount: number;
  hanonType: HanonType;
}

export function generateExerciseNotes(opts: GenerateOptions): ExerciseNote[] {
  const { mode, filter, tonality, scoreNoteCount, hanonType } = opts;

  const treble5 = ['C4', 'D4', 'E4', 'F4', 'G4'].map(n => applyTonalityToPitch(n, tonality));
  const trebleOct2 = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'].map(n => applyTonalityToPitch(n, tonality));
  const bass5 = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'].map(n => applyTonalityToPitch(n, tonality));

  let pool = treble5;
  if (filter === 'treble_oct2') pool = trebleOct2;
  else if (filter === 'bass') pool = bass5;

  const syllablesPool = [
    { syl: 'ТА', dur: 1 },
    { syl: 'ТИ-ТИ', dur: 0.5 },
    { syl: 'ТИ-РИ-ТИ-РИ', dur: 0.25 },
    { syl: 'ТА-А', dur: 2 }
  ];

  const result: ExerciseNote[] = [];

  if (mode === 'hanon') {
    let chosen = HANON_1_SEQ;
    if (hanonType === 'hanon2') chosen = HANON_2_SEQ;
    if (hanonType === 'groups4') chosen = GROUPS_4_SEQ;
    if (hanonType === 'coord') chosen = COORD_SEQ;

    return chosen.slice(0, scoreNoteCount).map((item, idx) => {
      const adjNote = applyTonalityToPitch(item.n, tonality);
      const noteDef = MIDI_NOTE_MAP[adjNote] || MIDI_NOTE_MAP['C4'];
      return {
        id: idx,
        noteName: adjNote,
        ...noteDef,
        finger: item.f,
        group4: item.g,
        articulation: item.art || 'legato',
        syllable: item.syl || (item.f >= 4 ? `Палец ${item.f}!` : 'ТИ-РИ'),
        durMultiplier: item.art === 'staccato' ? 1 : 0.5,
        status: idx === 0 ? 'current' : 'pending'
      };
    });
  }

  if (mode === 'intervals') {
    const patternPool = [0, 2, 1, 3, 2, 4, 3, 1, 0, 4, 2, 0, 1, 2, 3, 4];
    for (let i = 0; i < scoreNoteCount; i++) {
      const idx = patternPool[i % patternPool.length] % pool.length;
      const noteName = pool[idx];
      const noteDef = MIDI_NOTE_MAP[noteName] || MIDI_NOTE_MAP['C4'];
      result.push({
        id: i,
        noteName,
        ...noteDef,
        articulation: 'legato',
        syllable: 'ТА',
        durMultiplier: 1,
        status: i === 0 ? 'current' : 'pending'
      });
    }
    return result;
  }

  let prevIdx = Math.floor(pool.length / 2);
  for (let i = 0; i < scoreNoteCount; i++) {
    let noteName: string;
    if (mode === 'gpattern' || filter === 'both') {
      if (i % 4 === 0) {
        noteName = bass5[Math.floor(Math.random() * Math.min(5, bass5.length))];
      } else {
        const step = Math.floor(Math.random() * 3) - 1;
        prevIdx = Math.max(0, Math.min(treble5.length - 1, prevIdx + step));
        noteName = treble5[prevIdx];
      }
    } else {
      const maxStep = filter === 'treble_oct2' ? 2 : 1;
      const step = Math.floor(Math.random() * (maxStep * 2 + 1)) - maxStep;
      prevIdx = Math.max(0, Math.min(pool.length - 1, prevIdx + step));
      noteName = pool[prevIdx];
    }

    const rObj = mode === 'rhythm'
      ? syllablesPool[i % syllablesPool.length]
      : { syl: 'ТА', dur: 1 };

    const noteDef = MIDI_NOTE_MAP[noteName] || MIDI_NOTE_MAP['C4'];
    result.push({
      id: i,
      noteName,
      ...noteDef,
      articulation: 'legato',
      syllable: rObj.syl,
      durMultiplier: rObj.dur,
      status: i === 0 ? 'current' : 'pending'
    });
  }

  return result;
}
