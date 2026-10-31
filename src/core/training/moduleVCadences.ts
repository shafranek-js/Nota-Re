import { createAccompanimentStudy, type AccompanimentTexture } from './accompanimentStudy.ts';
import type { ChordInversion } from './chordStudy.ts';
import { createTwoHandSteps } from './lessonTwoHandScore.ts';
import type { ExerciseScore, SupportedKey } from '../notation/musicXml.ts';
import type { TwoHandStep } from './twoHandPractice.ts';

export const MODULE_V_CADENCE_COUNT = 36;
const KEYS: readonly SupportedKey[] = ['C', 'G', 'F', 'D'];
const TEXTURES: readonly AccompanimentTexture[] = ['alberti', 'waltz', 'arpeggio'];

export interface ModuleVCadenceFixture {
  readonly id: string;
  readonly score: ExerciseScore;
  readonly steps: readonly TwoHandStep[];
  readonly key: SupportedKey;
  readonly tonic: string;
  readonly leadingTone: string;
  readonly inversion: ChordInversion;
  readonly texture: AccompanimentTexture;
  readonly description: string;
  readonly dominantNotes: readonly string[];
  readonly tonicNotes: readonly string[];
}

/**
 * V5 is NOT a new assessment engine: 36 deterministic two-bar V–i scores
 * use the established harmonic minor pitches, two real independent staves
 * and the existing physical MIDI/rhythm/release evidence pipeline.
 */
export function createModuleVCadenceFixture(index: number): ModuleVCadenceFixture {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MODULE_V_CADENCE_COUNT) {
    throw new Error('Unknown V5 cadence fixture.');
  }
  const sequence = (index * 5 + 7) % MODULE_V_CADENCE_COUNT;
  const key = KEYS[Math.floor(sequence / 9)];
  const inversion = Math.floor((sequence % 9) / 3) as ChordInversion;
  const texture = TEXTURES[sequence % 3];
  const study = createAccompanimentStudy(key, 'minor', inversion, texture,
    'both', 0, 'harmonic');
  if (!study.leadingTone || !study.resolutionRightNotes) {
    throw new Error('Missing harmonic-minor dominant and tonic resolution.');
  }
  // The musical task is visible, but generator labels must not reveal the
  // answer (accidental, inversion or individual pitches) before score reading.
  const score: ExerciseScore = {
    ...study.score, title: 'Nota-Re — чтение каденции V–i', mode: 'minor'
  };
  const barTicks = score.beats * score.divisions;
  const dominant = score.notes.filter(n => n.onsetTicks < barTicks);
  const resolution = score.notes.filter(n => n.onsetTicks >= barTicks);
  const leadSpelling = study.leadingTone.replace('#', '');
  if (!(dominant.some(n => n.spelling?.step === leadSpelling &&
      n.spelling.alter === 1 && n.staff === 1)) ||
      resolution.some(n => n.spelling?.step === leadSpelling &&
        n.spelling.alter === 1) ||
      ![1, 2].every(staff =>
        dominant.some(n => n.staff === staff) && resolution.some(n => n.staff === staff))) {
    throw new Error('Incorrect written leading tone, independent staves or V–i resolution.');
  }
  const expectedEnd = 2 * barTicks;
  if (score.notes.some(n => n.onsetTicks < 0 ||
        n.onsetTicks + n.durationTicks > expectedEnd)) {
    throw new Error('Invalid cadence bar timing.');
  }
  const steps = createTwoHandSteps(score);
  return {
    id: 'v5-' + String(index + 1).padStart(2, '0'), score, steps,
    key, tonic: study.tonicName, leadingTone: study.leadingTone,
    inversion, texture,
    dominantNotes: study.rightNotes,
    tonicNotes: study.resolutionRightNotes,
    description: 'Первый такт — мажорная доминанта V с повышенной VII ступенью; '
      + 'во втором такте она разрешается в минорную тонику i. '
      + 'Сначала прочитайте обе нотные строки и определите вводный тон самостоятельно. '
      + 'Далее сыграйте две независимые партии в указанном ритме.'
  };
}
