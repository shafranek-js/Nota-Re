export interface HanonSequenceItem {
  n: string;
  f: number;
  g: number;
  art?: 'legato' | 'staccato';
  syl?: string;
}

export const HANON_1_SEQ: HanonSequenceItem[] = [
  { n: 'C4', f: 1, g: 1 }, { n: 'E4', f: 2, g: 1 }, { n: 'F4', f: 3, g: 1 }, { n: 'G4', f: 4, g: 1 },
  { n: 'A4', f: 5, g: 2 }, { n: 'G4', f: 4, g: 2 }, { n: 'F4', f: 3, g: 2 }, { n: 'E4', f: 2, g: 2 },
  { n: 'D4', f: 1, g: 3 }, { n: 'F4', f: 2, g: 3 }, { n: 'G4', f: 3, g: 3 }, { n: 'A4', f: 4, g: 3 },
  { n: 'B4', f: 5, g: 4 }, { n: 'A4', f: 4, g: 4 }, { n: 'G4', f: 3, g: 4 }, { n: 'F4', f: 2, g: 4 },
  { n: 'E4', f: 1, g: 5 }, { n: 'G4', f: 2, g: 5 }, { n: 'A4', f: 3, g: 5 }, { n: 'B4', f: 4, g: 5 },
  { n: 'C5', f: 5, g: 6 }, { n: 'B4', f: 4, g: 6 }, { n: 'A4', f: 3, g: 6 }, { n: 'G4', f: 2, g: 6 }
];

export const HANON_2_SEQ: HanonSequenceItem[] = [
  { n: 'C4', f: 1, g: 1 }, { n: 'D4', f: 2, g: 1 }, { n: 'G4', f: 5, g: 1 }, { n: 'F4', f: 4, g: 1 },
  { n: 'E4', f: 3, g: 2 }, { n: 'F4', f: 4, g: 2 }, { n: 'E4', f: 3, g: 2 }, { n: 'D4', f: 2, g: 2 },
  { n: 'D4', f: 1, g: 3 }, { n: 'E4', f: 2, g: 3 }, { n: 'A4', f: 5, g: 3 }, { n: 'G4', f: 4, g: 3 },
  { n: 'F4', f: 3, g: 4 }, { n: 'G4', f: 4, g: 4 }, { n: 'F4', f: 3, g: 4 }, { n: 'E4', f: 2, g: 4 },
  { n: 'E4', f: 1, g: 5 }, { n: 'F4', f: 2, g: 5 }, { n: 'B4', f: 5, g: 5 }, { n: 'A4', f: 4, g: 5 },
  { n: 'G4', f: 3, g: 6 }, { n: 'A4', f: 4, g: 6 }, { n: 'G4', f: 3, g: 6 }, { n: 'F4', f: 2, g: 6 }
];

export const GROUPS_4_SEQ: HanonSequenceItem[] = [
  { n: 'C4', f: 1, g: 1 }, { n: 'D4', f: 2, g: 1 }, { n: 'E4', f: 3, g: 1 }, { n: 'C4', f: 1, g: 1 },
  { n: 'D4', f: 2, g: 2 }, { n: 'E4', f: 3, g: 2 }, { n: 'F4', f: 4, g: 2 }, { n: 'D4', f: 2, g: 2 },
  { n: 'E4', f: 3, g: 3 }, { n: 'F4', f: 4, g: 3 }, { n: 'G4', f: 5, g: 3 }, { n: 'E4', f: 3, g: 3 },
  { n: 'F4', f: 4, g: 4 }, { n: 'G4', f: 5, g: 4 }, { n: 'A4', f: 5, g: 4 }, { n: 'F4', f: 4, g: 4 },
  { n: 'G4', f: 5, g: 5 }, { n: 'F4', f: 4, g: 5 }, { n: 'E4', f: 3, g: 5 }, { n: 'D4', f: 2, g: 5 },
  { n: 'E4', f: 3, g: 6 }, { n: 'D4', f: 2, g: 6 }, { n: 'C4', f: 1, g: 6 }, { n: 'C4', f: 1, g: 6 }
];

export const COORD_SEQ: HanonSequenceItem[] = [
  { n: 'C3', f: 5, g: 1, art: 'staccato', syl: 'ТА (stacc)' },
  { n: 'E4', f: 3, g: 1, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'F4', f: 4, g: 1, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'G4', f: 5, g: 1, art: 'legato',   syl: 'ТА (leg)' },
  { n: 'G3', f: 1, g: 2, art: 'staccato', syl: 'ТА (stacc)' },
  { n: 'G4', f: 5, g: 2, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'F4', f: 4, g: 2, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'E4', f: 3, g: 2, art: 'legato',   syl: 'ТА (leg)' },
  { n: 'F3', f: 2, g: 3, art: 'staccato', syl: 'ТА (stacc)' },
  { n: 'D4', f: 2, g: 3, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'E4', f: 3, g: 3, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'F4', f: 4, g: 3, art: 'legato',   syl: 'ТА (leg)' },
  { n: 'C3', f: 5, g: 4, art: 'staccato', syl: 'ТА (stacc)' },
  { n: 'E4', f: 3, g: 4, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'D4', f: 2, g: 4, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'C4', f: 1, g: 4, art: 'legato',   syl: 'ТА-А (leg)' },
  { n: 'G3', f: 1, g: 5, art: 'staccato', syl: 'ТА (stacc)' },
  { n: 'D4', f: 2, g: 5, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'E4', f: 3, g: 5, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'F4', f: 4, g: 5, art: 'legato',   syl: 'ТА (leg)' },
  { n: 'C3', f: 5, g: 6, art: 'staccato', syl: 'ТА (stacc)' },
  { n: 'E4', f: 3, g: 6, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'D4', f: 2, g: 6, art: 'legato',   syl: 'ТИ-ТИ (leg)' },
  { n: 'C4', f: 1, g: 6, art: 'legato',   syl: 'ТА (leg)' }
];
