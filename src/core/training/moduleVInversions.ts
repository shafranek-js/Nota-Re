import { createChordStudy, type ChordInversion, type ChordQuality } from './chordStudy.ts';
import { getVerticalChordGuides, type TriadFigure, type VerticalChordGuide } from '../notation/intervalGuides.ts';
import type { ExerciseScore, SupportedKey } from '../notation/musicXml.ts';

/**
 * Fixed, independently identifiable written-score questions. An opaque fixture
 * ID is safe to display; neither the ID nor the rendered title encodes answers.
 * The inversion answer comes only from the written notes via the guide parser.
 */
export const MODULE_V_INVERSION_COUNT = 24;
const KEYS: readonly SupportedKey[] = ['C', 'G', 'F', 'D'];
const QUALITIES: readonly ChordQuality[] = ['major', 'minor'];

export interface ModuleVInversionFixture {
  readonly id: string;
  readonly score: ExerciseScore;
  readonly guide: VerticalChordGuide;
}

export function createModuleVInversionFixture(index: number): ModuleVInversionFixture {
  if (!Number.isInteger(index) || index < 0 || index >= MODULE_V_INVERSION_COUNT) {
    throw new Error('Unknown Module V inversion fixture.');
  }
  // A permutation of all 4 keys × 2 qualities × 3 inversions: no predictable
  // 5/3 → 6 → 6/4 sequence in the visible question order.
  const sequence = (index * 5 + 7) % MODULE_V_INVERSION_COUNT;
  const key = KEYS[Math.floor(sequence / 6)];
  const quality = QUALITIES[Math.floor(sequence / 3) % 2];
  const presetInversion = (sequence % 3) as ChordInversion;
  const study = createChordStudy(key, quality, presetInversion);
  const score: ExerciseScore = {
    ...study.score,
    title: 'Nota-Re — чтение нот',
    // Do not embed the answer-bearing generator title or previous repetitions.
    mode: undefined,
    notes: study.score.notes.filter(event => event.onsetTicks === 0)
  };
  const guides = getVerticalChordGuides(score.notes, score.fifths, 'reading');
  if (guides.length !== 1 || guides[0].onsetTicks !== 0 ||
      guides[0].inversion !== presetInversion || guides[0].quality !== quality) {
    throw new Error('Invalid Module V inversion score: written notes disagree with fixture.');
  }
  return { id: 'v2-' + String(index + 1).padStart(2, '0'), score, guide: guides[0] };
}

export function evaluateModuleVInversion(
  fixture: ModuleVInversionFixture, response: TriadFigure
): { readonly correct: boolean; readonly guide: VerticalChordGuide } {
  if (response !== '5/3' && response !== '6' && response !== '6/4') {
    throw new Error('Invalid inversion response.');
  }
  // Re-derive the answer from the actual score rather than a chosen preset.
  const guides = getVerticalChordGuides(fixture.score.notes, fixture.score.fifths, 'reading');
  if (guides.length !== 1) throw new Error('Invalid written inversion question.');
  return { correct: guides[0].figure === response, guide: guides[0] };
}
