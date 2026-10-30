import type { ExerciseScore } from './musicXml.ts';
import { normalizeScoreDocument, quarter, type DiatonicStep, type ScoreDocument,
  type ScoreEvent, type ScorePitch } from './scoreDocument.ts';

/** Bridge only: legacy sixteenth ticks -> immutable quarter-note timeline. */
const CHROMATIC: readonly { step: DiatonicStep; alter: -1 | 0 | 1 }[] = [
  { step: 'C', alter: 0 }, { step: 'C', alter: 1 },
  { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
  { step: 'E', alter: 0 }, { step: 'F', alter: 0 },
  { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
  { step: 'G', alter: 1 }, { step: 'A', alter: 0 },
  { step: 'A', alter: 1 }, { step: 'B', alter: 0 }
];

export function spellLegacyMidi(midi: number, fifths: number): ScorePitch {
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) {
    throw new Error('Invalid MIDI pitch in legacy exercise.');
  }
  const pitchClass = midi % 12;
  const name = pitchClass === 10 && fifths === -1
    ? { step: 'B' as const, alter: -1 as const }
    : CHROMATIC[pitchClass]!;
  return { ...name, octave: Math.floor(midi / 12) - 1, midi };
}

/**
 * Existing musicXml ExerciseScore is sequential 4/4 with ticks=1/16.
 * This *read-only adapter* splits events at barlines into correctly tied
 * note segments, preserving simultaneous hand onsets/chords, existing XML
 * output and all course grading logic unchanged.
 */
export function fromLegacyExerciseScore(score: ExerciseScore, id = 'generated-exercise'): ScoreDocument {
  if (!score.notes.length || score.beats !== 4 || score.beatType !== 4 ||
      score.divisions !== 4 || !Number.isSafeInteger(score.fifths) ||
      score.fifths < -7 || score.fifths > 7) {
    throw new Error('Unsupported legacy exercise score.');
  }
  let endTicks = 0;
  for (const note of score.notes) {
    if (!Number.isSafeInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
        ![1, 2].includes(note.staff) ||
        !Number.isSafeInteger(note.onsetTicks) || note.onsetTicks < 0 ||
        !Number.isSafeInteger(note.durationTicks) || note.durationTicks <= 0 ||
        !Number.isSafeInteger(note.onsetTicks + note.durationTicks)) {
      throw new Error('Invalid legacy exercise note time or MIDI pitch.');
    }
    endTicks = Math.max(endTicks, note.onsetTicks + note.durationTicks);
  }
  const barCount = Math.ceil(endTicks / 16);
  if (barCount > 10000) throw new Error('Legacy exercise has too many measures.');
  const measures = Array.from({ length: barCount }, (_, index) => {
    const barRemainingTicks = endTicks - index * 16;
    const durationTicks = Math.min(16, barRemainingTicks);
    return {
      id: 'm' + (index + 1),
      printedNumber: String(index + 1),
      start: quarter(index * 16, 4),
      duration: quarter(durationTicks, 4),
      meter: { beats: 4 as const, beatType: 4 as const },
      partial: durationTicks !== 16,
      fifths: score.fifths
    };
  });
  const events: ScoreEvent[] = [];
  for (const [index, note] of score.notes.entries()) {
    let elapsed = 0;
    let segment = 0;
    let previousId: string | null = null;
    const pitch = spellLegacyMidi(note.midi, score.fifths);
    while (elapsed < note.durationTicks) {
      const at = note.onsetTicks + elapsed;
      const measureIndex = Math.floor(at / 16);
      const remaining = 16 - (at % 16);
      const chunkTicks = Math.min(remaining, note.durationTicks - elapsed);
      const eventId = 'legacy-' + index + '-' + segment;
      if (previousId) {
        const prev = events[events.length - 1]!;
        // Each split segment is appended next to its predecessor, not sorted
        // by onset. The validator checks tie direction after all events exist.
        if (prev.id !== previousId) throw new Error('Internal tie ordering error.');
        events[events.length - 1] = { ...prev, tieToId: eventId };
      }
      events.push({
        id: eventId, partId: 'P1', measureId: 'm' + (measureIndex + 1),
        staff: note.staff, voice: '1', kind: 'note', pitch,
        onset: quarter(at, 4), duration: quarter(chunkTicks, 4),
        ...(note.finger === undefined ? {} : { finger: note.finger }),
        ...(note.articulation === undefined ? {} : { articulation: note.articulation })
      });
      previousId = eventId;
      elapsed += chunkTicks;
      segment++;
    }
  }
  return normalizeScoreDocument({
    schemaVersion: 1, id, title: score.title, source: 'generated',
    parts: [{ id: 'P1', name: 'Piano', staves: 2 }],
    measures, events, tempos: []
  });
}
