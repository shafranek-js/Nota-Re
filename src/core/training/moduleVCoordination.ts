import { createAccompanimentStudy } from './accompanimentStudy.ts';
import { createTwoHandSteps } from './lessonTwoHandScore.ts';
import { createScoreFromTimedHands, type ExerciseScore, type ScoreEvent, type SupportedKey,
  type TimedHandPitch } from '../notation/musicXml.ts';
import type { TwoHandStep } from './twoHandPractice.ts';

export type CoordinationPattern = 'delayed-entry' | 'held-harmony' | 'staggered';
export interface ModuleVCoordinationFixture {
  readonly id: string;
  readonly pattern: CoordinationPattern;
  readonly score: ExerciseScore;
  readonly steps: readonly TwoHandStep[];
}
export const MODULE_V_COORDINATION_COUNT = 24;
const KEYS: readonly SupportedKey[] = ['C', 'G', 'F', 'D'];
const PATTERNS: readonly CoordinationPattern[] = ['delayed-entry', 'held-harmony', 'staggered'];

function toTimed(event: ScoreEvent): TimedHandPitch {
  return {
    midi: event.midi, onsetTicks: event.onsetTicks, durationTicks: event.durationTicks,
    ...(event.articulation ? { articulation: event.articulation } : {}),
    ...(event.spelling ? { spelling: event.spelling } : {})
  };
}

/** Based on two *independent* real-staff timelines, never a sequential proxy. */
export function createModuleVCoordinationFixture(index: number): ModuleVCoordinationFixture {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MODULE_V_COORDINATION_COUNT) {
    throw new Error('Unknown Module V coordination fixture.');
  }
  const sequence = (index * 5 + 7) % MODULE_V_COORDINATION_COUNT;
  const key = KEYS[Math.floor(sequence / 6)];
  const quality = sequence % 6 < 3 ? 'major' : 'minor';
  const pattern = PATTERNS[sequence % 3];
  const texture = pattern === 'held-harmony' ? 'waltz' :
    pattern === 'delayed-entry' ? 'alberti' : 'arpeggio';
  const study = createAccompanimentStudy(key, quality, 0, texture, 'both');
  const beats = study.score.beats;
  const barTicks = beats * 4;
  const left = study.score.notes.filter(note => note.staff === 2).map(toTimed);
  const right: TimedHandPitch[] = [];
  for (const origin of [0, barTicks]) {
    const notes = study.score.notes.filter(n =>
      n.staff === 1 && n.onsetTicks === origin).sort((a, b) => a.midi - b.midi);
    if (notes.length !== 3) throw new Error('Expected three independently notated RH pitches.');
    if (pattern === 'held-harmony') {
      for (const note of notes) right.push(toTimed(note));
    } else {
      const starts = pattern === 'delayed-entry' ? [4, 8, 12] : [2, 6, 10, 14];
      for (let j = 0; j < starts.length; j++) {
        const source = notes[j % notes.length];
        right.push({ ...toTimed(source), onsetTicks: origin + starts[j],
          durationTicks: pattern === 'staggered' ? 2 : 4 });
      }
    }
  }
  const score = createScoreFromTimedHands(
    right, left, key, 'Nota-Re — независимые партии двух рук', beats
  );
  const steps = createTwoHandSteps(score);
  if (!score.notes.some(n => n.staff === 1) || !score.notes.some(n => n.staff === 2) ||
      steps[0]?.onsetTicks !== 0 || score.notes.some(n =>
        n.onsetTicks < 0 || n.onsetTicks + n.durationTicks > barTicks * 2)) {
    throw new Error('Invalid coordination score timeline.');
  }
  return { id: 'v4-' + String(index + 1).padStart(2, '0'), pattern, score, steps };
}
export const COORDINATION_DESCRIPTIONS: Readonly<Record<CoordinationPattern, string>> = {
  'delayed-entry': 'Бас вступает на первую долю; правая рука начинает со второй. Следите за одновременными атаками и отдельными отпусками клавиш.',
  'held-harmony': 'Правая рука удерживает трезвучие на протяжении такта, пока левая играет бас и двузвучия на второй и третьей долях в 3/4.',
  'staggered': 'Левая рука играет ровный рисунок, правая вступает между её атаками. Руки сохраняют независимые времена вступления и окончания звуков.'
};
