import type { ExerciseScore, StaffNumber } from '../notation/musicXml.ts';
import type { TimedPracticeState } from './tempoTwoHand.ts';

/**
 * Diagnostics for physical key releases, separate from onset accuracy.
 * Web MIDI cannot identify which FINGER played a pitch or prove expressive
 * phrasing: this is only note duration + written articulation evidence.
 */
export interface LessonReleaseEvidence {
  readonly expected: number;
  readonly observed: number;
  readonly legato: { readonly expected: number; readonly observed: number };
  readonly staccato: { readonly expected: number; readonly observed: number };
  readonly right: { readonly expected: number; readonly observed: number };
  readonly left: { readonly expected: number; readonly observed: number };
  readonly complete: boolean;
  readonly validated: boolean;
  readonly fingeringVerified: false;
}

export function assessLessonReleases(
  score: ExerciseScore, state: TimedPracticeState
): LessonReleaseEvidence {
  const key = (tick: number, pitch: number) => tick + ':' + pitch;
  const expected = new Map(score.notes.map(n => [key(n.onsetTicks, n.midi), n]));
  const releases = state.releasedNotes;
  const unique = new Map(releases.map(n => [key(n.onsetTicks, n.midi), n]));
  const attackTimes = new Map(state.acceptedAttacks.map(n => [
    key(n.onsetTicks, n.midi), n.atMs
  ]));
  // Reject fabricated, duplicated, negative or pre-attack NoteOff evidence.
  const evidenceValid = expected.size === score.notes.length &&
    unique.size === releases.length &&
    releases.every(n => {
      const item = key(n.onsetTicks, n.midi);
      const attack = attackTimes.get(item);
      return expected.has(item) && attack !== undefined &&
        Number.isFinite(n.atMs) && n.atMs >= attack;
    });

  const count = (staff?: StaffNumber, articulation?: 'legato' | 'staccato') => {
    const notes = score.notes.filter(n =>
      (staff === undefined || n.staff === staff) &&
      (articulation === undefined || n.articulation === articulation));
    return {
      expected: notes.length,
      observed: notes.filter(n => unique.has(key(n.onsetTicks, n.midi))).length
    };
  };
  const all = count();
  const legato = count(undefined, 'legato');
  const staccato = count(undefined, 'staccato');
  const right = count(1);
  const left = count(2);
  const complete = evidenceValid && all.expected > 0 && all.observed === all.expected;
  return {
    expected: all.expected, observed: all.observed, legato, staccato,
    right, left, complete,
    validated: complete && state.finished &&
      state.earlyReleases === 0 && state.overheldNotes === 0 &&
      state.interruptions === 0,
    fingeringVerified: false
  };
}
