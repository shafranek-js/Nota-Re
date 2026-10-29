import { MIDI_NOTE_MAP } from '../../data/notes.ts';
import { applyTonalityToPitch } from '../generator/ExerciseGenerator.ts';
import { createScoreFromHands, type ExerciseScore, type ExercisePitch, type SupportedKey } from '../notation/musicXml.ts';

/** Independent hand attacks, merged by shared musical onset (sixteenth ticks). */
export interface TwoHandStep {
  readonly onsetTicks: number;
  readonly expectedMidi: readonly number[];
  readonly durationTicks: number;
}

export interface TwoHandPracticeScore {
  readonly score: ExerciseScore;
  readonly steps: readonly TwoHandStep[];
}

/**
 * A short, deterministic two-staff exercise: RH quarters over LH halves.
 * Both hands START together, and LH notes sound through the intermediate RH
 * attacks. All rhythms are engraved by the existing MusicXML score model.
 *
 * Kept separate from graded course generation until input/timing acceptance.
 */
export function createTwoHandPractice(
  tonality: SupportedKey,
  rightNoteCount: 8 | 16 = 16
): TwoHandPracticeScore {
  const rightNames = ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4'];
  const leftNames = ['C3', 'G3', 'D3', 'G3'];

  const make = (name: string, durMultiplier: number): ExercisePitch => {
    const adjusted = applyTonalityToPitch(name, tonality);
    const definition = MIDI_NOTE_MAP[adjusted];
    if (!definition) throw new Error('Missing exercise pitch ' + adjusted);
    return {
      midi: definition.midi,
      clef: definition.clef,
      durMultiplier,
      finger: definition.finger,
      articulation: 'legato'
    };
  };

  const right = Array.from({ length: rightNoteCount }, (_, i) =>
    make(rightNames[i % rightNames.length], 1));
  const left = Array.from({ length: rightNoteCount / 2 }, (_, i) =>
    make(leftNames[i % leftNames.length], 2));

  const score = createScoreFromHands(right, left, tonality, 'Nota-Re — two-hand MIDI practice');
  const onsetMap = new Map<number, number[]>();
  for (const note of score.notes) {
    const pitches = onsetMap.get(note.onsetTicks) ?? [];
    if (pitches.includes(note.midi)) throw new Error('Duplicate pitch at one onset');
    pitches.push(note.midi);
    onsetMap.set(note.onsetTicks, pitches);
  }
  const timestamps = [...onsetMap.keys()].sort((a, b) => a - b);
  const endTicks = Math.max(...score.notes.map(note => note.onsetTicks + note.durationTicks));
  const steps = timestamps.map((onsetTicks, i) => ({
    onsetTicks,
    expectedMidi: [...(onsetMap.get(onsetTicks) ?? [])].sort((a, b) => a - b),
    durationTicks: (timestamps[i + 1] ?? endTicks) - onsetTicks
  }));
  return { score, steps };
}

/**
 * Physical MIDI overlap assessment, deliberately independent of course
 * certification. A chord passes only while ALL expected keys are physically
 * held and the note-on timestamps fit within one onset tolerance.
 */
export type PracticeMidiEvent =
  | { type: 'note-on'; note: number; channel: number; receivedAtMs: number }
  | { type: 'note-off'; note: number; channel: number; receivedAtMs?: number }
  | { type: 'panic' };

export interface ChordPracticeState {
  readonly stepIndex: number;
  /** Channel-specific held keys, not sustain-pedal voices. */
  readonly held: readonly { note: number; channel: number }[];
  readonly captured: readonly { note: number; receivedAtMs: number }[];
  readonly feedback: 'ready' | 'partial' | 'correct' | 'wrong' | 'slow' | 'complete';
}

export function initialChordPractice(): ChordPracticeState {
  return { stepIndex: 0, held: [], captured: [], feedback: 'ready' };
}

export function reduceChordPractice(
  state: ChordPracticeState,
  steps: readonly TwoHandStep[],
  event: PracticeMidiEvent,
  windowMs = 180
): ChordPracticeState {
  if (event.type === 'panic') return { ...state, held: [], captured: [], feedback: 'ready' };
  if (event.type === 'note-off') {
    const held = state.held.filter(key => !(key.note === event.note && key.channel === event.channel));
    // A released key must be struck again for a valid simultaneous chord.
    const stillHeld = new Set(held.map(key => key.note));
    const captured = state.captured.filter(key => stillHeld.has(key.note));
    return { ...state, held, captured };
  }

  if (state.held.some(key => key.note === event.note && key.channel === event.channel)) {
    // Repeated MIDI NoteOn while a key is down is not a new attack.
    return state;
  }
  const held = [...state.held, { channel: event.channel, note: event.note }];
  const step = steps[state.stepIndex];
  if (!step) return { ...state, held, feedback: 'complete' };
  if (!step.expectedMidi.includes(event.note)) {
    return { ...state, held, captured: [], feedback: 'wrong' };
  }
  // Reject duplicate pitch attacks (including across MIDI channels) as a
  // substitute for another missing note in the expected chord.
  if (state.captured.some(key => key.note === event.note)) {
    return { ...state, held };
  }
  const earliest = Math.min(event.receivedAtMs, ...state.captured.map(key => key.receivedAtMs));
  const slow = event.receivedAtMs - earliest > windowMs;
  const captured = slow ? [{ note: event.note, receivedAtMs: event.receivedAtMs }]
    : [...state.captured, { note: event.note, receivedAtMs: event.receivedAtMs }];
  const matched = step.expectedMidi.every(note => captured.some(key => key.note === note) &&
    held.some(key => key.note === note));
  if (!matched) return { ...state, held, captured, feedback: slow ? 'slow' : 'partial' };
  const stepIndex = state.stepIndex + 1;
  return {
    stepIndex,
    held,
    captured: [],
    feedback: stepIndex >= steps.length ? 'complete' : 'correct'
  };
}
