import { createAccompanimentStudy, type AccompanimentTexture } from './accompanimentStudy.ts';
import type { ExerciseScore, SupportedKey, ScoreEvent } from '../notation/musicXml.ts';
import { createTwoHandSteps } from './lessonTwoHandScore.ts';

const KEYS: readonly SupportedKey[] = ['C', 'G', 'F', 'D'];
const TEXTURES: readonly AccompanimentTexture[] = ['alberti', 'waltz', 'arpeggio'];
export const MODULE_V_LH_COUNT = 24;

export interface ModuleVLeftFixture {
  readonly id: string;
  readonly score: ExerciseScore;
  readonly steps: ReturnType<typeof createTwoHandSteps>;
}

/**
 * Analyze the written attacks and their grouping, not an option or a
 * generator preset. Fail closed for unrecognized, mixed or incomplete scores.
 */
export function readLeftTexture(score: ExerciseScore): AccompanimentTexture | null {
  if (score.notes.length === 0 || score.notes.some(n => n.staff !== 2)) return null;
  const bar = score.beats * score.divisions;
  if (score.beatType !== 4 || score.divisions !== 4 ||
      (score.beats !== 3 && score.beats !== 4)) return null;
  const notes = [...score.notes].sort((a, b) => a.onsetTicks - b.onsetTicks || a.midi - b.midi);
  if (notes.some(n => !Number.isSafeInteger(n.onsetTicks) || !Number.isSafeInteger(n.durationTicks) ||
      n.durationTicks <= 0 || n.onsetTicks < 0 || n.onsetTicks + n.durationTicks > 2 * bar)) return null;
  const group = (items: readonly ScoreEvent[], onset: number) =>
    items.filter(n => n.onsetTicks === onset).map(n => n.midi).sort((a, b) => a - b);
  if (score.beats === 3) {
    if (notes.length !== 10) return null;
    const basses: number[] = [];
    for (const origin of [0, bar]) {
      const bass = group(notes, origin), second = group(notes, origin + 4),
        third = group(notes, origin + 8);
      if (bass.length !== 1 || second.length !== 2 || third.length !== 2 ||
          bass[0] >= second[0] || second[0] >= second[1] ||
          second[0] !== third[0] || second[1] !== third[1]) return null;
      if (notes.filter(n => n.onsetTicks >= origin && n.onsetTicks < origin + bar)
        .some(n => n.durationTicks !== 4)) return null;
      basses.push(bass[0]);
    }
    return basses[0] === basses[1] ? 'waltz' : null;
  }

  if (notes.length !== 16) return null;
  let recognized: AccompanimentTexture | null = null;
  for (const origin of [0, bar]) {
    const barNotes = notes.filter(n => n.onsetTicks >= origin && n.onsetTicks < origin + bar);
    if (barNotes.length !== 8 || barNotes.some((n, i) =>
      n.onsetTicks !== origin + i * 2 || n.durationTicks !== 2)) return null;
    const pitches = [...new Set(barNotes.map(n => n.midi))].sort((a, b) => a - b);
    if (pitches.length !== 3) return null;
    const sequence = barNotes.map(n => pitches.indexOf(n.midi));
    const isAlberti = sequence.every((n, i) => n === [0, 2, 1, 2, 0, 2, 1, 2][i]);
    const isArpeggio = sequence.every((n, i) => n === [0, 1, 2, 1, 0, 1, 2, 1][i]);
    const type = isAlberti ? 'alberti' : isArpeggio ? 'arpeggio' : null;
    if (!type || (recognized !== null && recognized !== type)) return null;
    recognized = type;
  }
  return recognized;
}

export function createModuleVLeftFixture(index: number, shift: 0 | 12 = 0): ModuleVLeftFixture {
  if (!Number.isInteger(index) || index < 0 || index >= MODULE_V_LH_COUNT ||
      (shift !== 0 && shift !== 12)) throw new Error('Invalid V3 fixture.');
  const choice = (index * 5 + 7) % MODULE_V_LH_COUNT;
  const key = KEYS[Math.floor(choice / 6)];
  const quality = choice % 6 < 3 ? 'major' : 'minor';
  const texture = TEXTURES[choice % 3];
  const study = createAccompanimentStudy(key, quality, 0, texture, 'left', shift);
  const score: ExerciseScore = {
    ...study.score, title: 'Nota-Re — чтение басовой строки', mode: undefined
  };
  if (readLeftTexture(score) !== texture || score.notes.some(note => note.staff !== 2)) {
    throw new Error('Generated LH score does not match written-note recognition.');
  }
  return { id: 'v3-' + String(index + 1).padStart(2, '0'), score, steps: createTwoHandSteps(score) };
}

export function evaluateModuleVLeftFixture(
  fixture: ModuleVLeftFixture, response: AccompanimentTexture
): { correct: boolean; texture: AccompanimentTexture } {
  if (!TEXTURES.includes(response)) throw new Error('Invalid texture response.');
  const actual = readLeftTexture(fixture.score);
  if (!actual) throw new Error('Unrecognized score.');
  return { correct: response === actual, texture: actual };
}

export function explainLeftTexture(texture: AccompanimentTexture): string {
  switch (texture) {
    case 'alberti': return 'В размере 4/4 бас звучит ровными восьмыми: нижний — верхний — средний — верхний, затем цикл повторяется.';
    case 'arpeggio': return 'В размере 4/4 бас звучит ровными восьмыми: нижний — средний — верхний — средний, затем цикл повторяется.';
    case 'waltz': return 'В размере 3/4 первая доля — одиночный низкий бас, на вторую и третью доли звучит двузвучие над ним. Это не три последовательные четверти.';
  }
}
