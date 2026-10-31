import { addQuarter, compareQuarter, type QuarterTime, type ScoreDocument, type ScoreEvent,
  type ScoreMeasureRange } from '../notation/scoreDocument.ts';
import type { TimedTone } from '../audio/audioTimeline.ts';
import type { ExerciseScore } from '../notation/musicXml.ts';

/**
 * Free, self-paced polyphonic MIDI rehearsal. Never returns AttemptSnapshot,
 * lesson evidence or course credit. Sound produced by the companion is output,
 * not an input event and must not be fed back into this reducer.
 */
export type PolyphonicHandMode = 'both' | 'right' | 'left';
export interface PolyphonicNote {
  readonly eventId: string;
  readonly midi: number;
  readonly staff: number;
}
export interface PolyphonicStep {
  readonly onset: QuarterTime;
  readonly measureId: string;
  readonly targets: readonly PolyphonicNote[];
  /** Relative to this step's onset; the other hand may strike between targets. */
  readonly companion: readonly TimedTone[];
  /** Tied attacks that must remain physically held at this next musical entry. */
  readonly requiredHeld?: readonly number[];
}
export interface PolyphonicPlan {
  readonly mode: PolyphonicHandMode;
  readonly steps: readonly PolyphonicStep[];
  readonly reason: string | null;
}
export type PolyphonicPhase = 'idle' | 'playing' | 'complete';
export interface PolyphonicTrial {
  readonly phase: PolyphonicPhase;
  readonly index: number;
  /** Number of fully completed onset groups (not individual keys). */
  readonly correct: number;
  readonly wrong: number;
  readonly held: readonly number[];
  /** Extra physical keys must be released before a chord can pass. */
  readonly wrongHeld: readonly number[];
  readonly matched: readonly number[];
  readonly completedStepIndex: number | null;
  readonly last: 'correct' | 'wrong' | null;
}
export type PolyphonicKeyEvent =
  | { readonly type: 'note-on'; readonly note: number }
  | { readonly type: 'note-off'; readonly note: number };

const empty = (mode: PolyphonicHandMode, reason: string): PolyphonicPlan =>
  ({ mode, reason, steps: [] });
const asBeats = (t: QuarterTime): number => t.numerator / t.denominator;
const endOf = (e: ScoreEvent): QuarterTime => addQuarter(e.onset, e.duration);

/** Integrate exact score-time tempo-change boundaries, never assume fixed 4/4. */
function elapsedSeconds(score: ScoreDocument, from: QuarterTime, to: QuarterTime): number {
  if (compareQuarter(from, to) >= 0) return 0;
  let bpm = 80;
  for (const change of score.tempos) {
    if (compareQuarter(change.onset, from) > 0) break;
    bpm = change.quarterBpm;
  }
  let at = from, seconds = 0;
  for (const change of score.tempos) {
    if (compareQuarter(change.onset, from) <= 0) continue;
    if (compareQuarter(change.onset, to) >= 0) break;
    seconds += (asBeats(change.onset) - asBeats(at)) * 60 / bpm;
    bpm = change.quarterBpm;
    at = change.onset;
  }
  return seconds + (asBeats(to) - asBeats(at)) * 60 / bpm;
}

/**
 * A tie continuation is NOT an attack. We resolve complete source chains
 * before grouping MIDI steps. A–B cannot silently clip a connected note:
 * restarting or truncating a note would teach the wrong physical gesture.
 *
 * Free practice checks physical sustain only at the next independent attack,
 * NOT the absolute note-off time. Timed hold grading belongs to a later stage.
 */
export function planPolyphonicRehearsal(
  score: ScoreDocument, range: ScoreMeasureRange, mode: PolyphonicHandMode
): PolyphonicPlan {
  if (score.source !== 'imported') return empty(mode, 'Только импортированная MusicXML-партитура.');
  if (score.parts.length !== 1 || score.parts[0]!.staves > 2) {
    return empty(mode, 'Пока поддерживается одна партия на одном или двух станах.');
  }
  if (mode !== 'both' && score.parts[0]!.staves !== 2) {
    return empty(mode, 'Раздельные руки доступны только для партии с двумя станами.');
  }
  const measureIds = new Set(range.measureIds);
  const allNotes = score.events.filter(e => e.kind === 'note');
  const selectedNotes = allNotes.filter(e => measureIds.has(e.measureId));
  if (!selectedNotes.length) return empty(mode, 'В выбранных тактах нет нот.');
  if (selectedNotes.length > 512) return empty(mode, 'Выберите не более 512 нот.');
  if (selectedNotes.some(e => !e.pitch || !Number.isSafeInteger(e.pitch.midi) ||
      e.pitch.midi < 21 || e.pitch.midi > 108)) {
    return empty(mode, 'Неподдерживаемая высота ноты вне диапазона фортепиано A0–C8.');
  }
  // Voices are independent timelines, including two voices on one staff.
  // A physical MIDI key identifies pitch, not MusicXML voice; overlaps of
  // the *same* pitch therefore need a conservative ambiguity gate below.
  const byId = new Map(allNotes.map(e => [e.id, e]));
  const continuedIds = new Set(allNotes.flatMap(e => e.tieToId ? [e.tieToId] : []));
  if (continuedIds.size !== allNotes.filter(e => e.tieToId).length) {
    return empty(mode, 'Неоднозначное продолжение связующей лиги.');
  }
  type Attack = { event: ScoreEvent; end: QuarterTime; tied: boolean };
  const attacks: Attack[] = [];
  const visited = new Set<string>();
  for (const head of allNotes) {
    if (continuedIds.has(head.id)) continue;
    let tail = head;
    const chain = [head];
    const local = new Set<string>([head.id]);
    while (tail.tieToId) {
      const next = byId.get(tail.tieToId);
      if (!next || !next.pitch || !tail.pitch ||
          next.partId !== tail.partId || next.staff !== tail.staff ||
          next.voice !== tail.voice || next.pitch.midi !== tail.pitch.midi ||
          next.pitch.step !== tail.pitch.step ||
          next.pitch.alter !== tail.pitch.alter ||
          next.pitch.octave !== tail.pitch.octave ||
          compareQuarter(endOf(tail), next.onset) !== 0 ||
          local.has(next.id) || chain.length > allNotes.length) {
        return empty(mode, 'Некорректная цепочка связующей лиги.');
      }
      local.add(next.id);
      chain.push(next);
      tail = next;
    }
    for (const segment of chain) {
      if (visited.has(segment.id)) return empty(mode, 'Неоднозначная цепочка связующей лиги.');
      visited.add(segment.id);
    }
    const selected = chain.filter(segment => measureIds.has(segment.measureId));
    if (!selected.length) continue;
    if (selected.length !== chain.length) {
      return empty(mode, 'Диапазон A–B разрывает связующую лигу: выберите все связанные такты.');
    }
    attacks.push({ event: head, end: endOf(tail), tied: chain.length > 1 });
  }
  if (visited.size !== allNotes.length) {
    return empty(mode, 'Найдена незавершённая или циклическая связующая лига.');
  }
  // A prior non-tied sound also cannot be misrepresented as a fresh attack
  // at A. This is deliberately conservative for rest or pickup boundaries.
  if (allNotes.some(e => compareQuarter(e.onset, range.start) < 0 &&
      compareQuarter(endOf(e), range.start) > 0)) {
    return empty(mode, 'Через границу A удерживается нота из предыдущего такта.');
  }
  const ordered = attacks.sort((a, b) =>
    compareQuarter(a.event.onset, b.event.onset) ||
    a.event.staff - b.event.staff ||
    a.event.pitch!.midi - b.event.pitch!.midi);
  // A key cannot provide independent evidence for two overlapping notes
  // of the same MIDI pitch, whether in two voices or on different staves.
  // Equally timed unisons and a later attack before physical key-off are
  // both ambiguous. Non-overlapping repetitions still require fresh NoteOn.
  const byPitch = new Map<number, Attack[]>();
  for (const attack of ordered) {
    const midi = attack.event.pitch!.midi;
    const previous = byPitch.get(midi) ?? [];
    if (previous.some(old =>
        compareQuarter(old.event.onset, attack.end) < 0 &&
        compareQuarter(attack.event.onset, old.end) < 0)) {
      return empty(mode, 'Перекрывающиеся одинаковые высоты в разных голосах или станах нельзя независимо подтвердить одной MIDI-клавишей.');
    }
    previous.push(attack);
    byPitch.set(midi, previous);
  }
  const targetStaff = mode === 'right' ? 1 : mode === 'left' ? 2 : null;
  const targets = ordered.filter(a => targetStaff === null || a.event.staff === targetStaff);
  if (!targets.length) return empty(mode, 'Для выбранной руки в диапазоне нет нот.');
  const groups: Attack[][] = [];
  for (const attack of targets) {
    const last = groups[groups.length - 1];
    if (last && compareQuarter(last[0]!.event.onset, attack.event.onset) === 0) last.push(attack);
    else groups.push([attack]);
  }
  if (groups.length > 128) return empty(mode, 'Выберите не более 128 шагов.');
  const companionAttacks = ordered.filter(a =>
    targetStaff !== null && a.event.staff !== targetStaff);
  if (companionAttacks.length &&
      compareQuarter(companionAttacks[0]!.event.onset, groups[0]![0]!.event.onset) < 0) {
    return empty(mode, 'Сопровождение начинается раньше выбранной руки; начните с другого диапазона A–B.');
  }
  // Companion is scheduled in additive, independently cancellable AudioContext
  // queues: a held note is never forcibly cut by the next MIDI step.
  const steps = groups.map((group, index): PolyphonicStep => {
    const from = group[0]!.event.onset;
    const next = groups[index + 1]?.[0]?.event.onset ?? range.end;
    const companion = companionAttacks
      .filter(a => compareQuarter(a.event.onset, from) >= 0 &&
        compareQuarter(a.event.onset, next) < 0);
    const tones: TimedTone[] = companion.map(a => {
      const limit = compareQuarter(a.end, range.end) > 0 ? range.end : a.end;
      const duration = elapsedSeconds(score, a.event.onset, limit);
      return {
        offsetSeconds: elapsedSeconds(score, from, a.event.onset),
        durationSeconds: a.event.articulation === 'staccato' ?
          Math.min(0.12, duration * 0.55) : duration * 0.96,
        frequencyHz: 440 * Math.pow(2, (a.event.pitch!.midi - 69) / 12),
        staccato: a.event.articulation === 'staccato'
      };
    });
    // Every sustained voice, not just a tied note, must stay physically
    // depressed when another independent attack begins. This is an onset
    // checkpoint, NOT an absolute duration or release-time grade.
    const requiredHeld = targets.filter(a =>
      compareQuarter(a.event.onset, from) < 0 &&
      compareQuarter(a.end, from) > 0).map(a => a.event.pitch!.midi);
    return {
      onset: from, measureId: group[0]!.event.measureId,
      targets: group.map(a => ({ eventId: a.event.id,
        midi: a.event.pitch!.midi, staff: a.event.staff })),
      companion: tones,
      ...(requiredHeld.length ? { requiredHeld } : {})
    };
  });
  return { mode, steps, reason: null };
}

export const initialPolyphonicTrial = (): PolyphonicTrial => ({
  phase: 'idle', index: 0, correct: 0, wrong: 0,
  held: [], wrongHeld: [], matched: [], completedStepIndex: null, last: null
});

export function startPolyphonicTrial(plan: PolyphonicPlan): PolyphonicTrial {
  return plan.reason || !plan.steps.length ? initialPolyphonicTrial()
    : { ...initialPolyphonicTrial(), phase: 'playing' };
}

/**
 * A chord is completed only when every required fresh MIDI Note On is still
 * physically held. Releasing part of an unfinished chord clears that attack.
 * Already-held pitches never satisfy a repeated attack in the next step.
 * Pedal messages never simulate Note On/Off.
 */
export function recordPolyphonicKey(
  state: PolyphonicTrial, plan: PolyphonicPlan, event: PolyphonicKeyEvent
): PolyphonicTrial {
  if (state.phase !== 'playing' || plan.reason ||
      !Number.isSafeInteger(event.note) || event.note < 0 || event.note > 127) return state;
  if (event.type === 'note-off') {
    if (!state.held.includes(event.note)) return state;
    return { ...state, held: state.held.filter(p => p !== event.note),
      wrongHeld: state.wrongHeld.filter(p => p !== event.note),
      matched: state.matched.filter(p => p !== event.note) };
  }
  if (state.held.includes(event.note)) return state;
  const held = [...state.held, event.note];
  const step = plan.steps[state.index];
  if (!step) return state;
  if (!step.targets.some(t => t.midi === event.note)) {
    return { ...state, held, wrongHeld: [...state.wrongHeld, event.note],
      matched: [], wrong: state.wrong + 1, last: 'wrong' };
  }
  const matched = [...state.matched, event.note];
  // A wrong key, even when already held from earlier in the same attempt,
  // must be physically released and all required attacks repeated.
  if (state.wrongHeld.length) {
    return { ...state, held, matched: [], last: 'wrong' };
  }
  if (!step.targets.every(t => matched.includes(t.midi))) {
    return { ...state, held, matched, last: null };
  }
  const next = state.index + 1;
  // A tied pitch must still be held when the next independent attack is
  // made. If not, record a wrong step (no fake correct credit or accompaniment)
  // and let the user continue to the next group or retry the passage.
  const sustainOk = (step.requiredHeld ?? []).every(midi => held.includes(midi));
  return { ...state, held, matched: [], index: next,
    correct: state.correct + (sustainOk ? 1 : 0),
    wrong: state.wrong + (sustainOk ? 0 : 1),
    last: sustainOk ? 'correct' : 'wrong',
    completedStepIndex: sustainOk ? state.index : null,
    phase: next >= plan.steps.length ? 'complete' : 'playing' };
}


/**
 * Generated Module V exercises use sixteenth-note ticks rather than imported
 * MusicXML's rational quarter-time. Convert them to the same ephemeral
 * companion practice contract without modifying the actual exercise score or
 * its existing meter-based assessment.
 */
export function planGeneratedHandRehearsal(
  score: ExerciseScore, bpm: number, mode: 'right' | 'left'
): PolyphonicPlan {
  const fail = (reason: string): PolyphonicPlan => empty(mode, reason);
  if (mode !== 'right' && mode !== 'left') return fail('Неизвестная выбранная рука.');
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 240) return fail('Недопустимый темп практики.');
  if (!score.notes.length || score.notes.length > 512) return fail('Выберите упражнение до 512 нот.');
  if (score.notes.some(n => !Number.isSafeInteger(n.midi) || n.midi < 21 || n.midi > 108 ||
    ![1, 2].includes(n.staff) || !Number.isSafeInteger(n.onsetTicks) || n.onsetTicks < 0 ||
    !Number.isSafeInteger(n.durationTicks) || n.durationTicks <= 0)) {
    return fail('Недопустимые ноты, длительности или номера станов.');
  }
  if (![1, 2].every(staff => score.notes.some(n => n.staff === staff)))
    return fail('Для сопровождения требуется настоящая двухстанная фактура.');
  const expectedStaff = mode === 'right' ? 1 : 2;
  const sorted = score.notes.map((note, index) => ({ note, index }))
    .sort((a, b) => a.note.onsetTicks - b.note.onsetTicks ||
      a.note.staff - b.note.staff || a.note.midi - b.note.midi);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1]!.note.onsetTicks === sorted[i]!.note.onsetTicks &&
      sorted[i - 1]!.note.midi === sorted[i]!.note.midi)
      return fail('Одновременные унисоны нельзя достоверно разделить по MIDI.');
  }
  const target = sorted.filter(e => e.note.staff === expectedStaff);
  const other = sorted.filter(e => e.note.staff !== expectedStaff);
  if (other[0]!.note.onsetTicks < target[0]!.note.onsetTicks)
    return fail('Сопровождение начинается до первой ноты выбранной руки.');
  const groups: typeof target[] = [];
  for (const item of target) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.note.onsetTicks === item.note.onsetTicks) last.push(item);
    else groups.push([item]);
  }
  if (groups.length > 128) return fail('Упражнение содержит более 128 учебных шагов.');
  const tickSeconds = 60 / bpm / 4;
  const steps: PolyphonicStep[] = groups.map((items, i) => {
    const onset = items[0]!.note.onsetTicks;
    const next = groups[i + 1]?.[0]?.note.onsetTicks ?? Infinity;
    const companion = other
      .filter(({ note }) => note.onsetTicks >= onset && note.onsetTicks < next)
      .map(({ note }): TimedTone => ({
        offsetSeconds: (note.onsetTicks - onset) * tickSeconds,
        durationSeconds: (note.articulation === 'staccato' ?
          Math.min(0.12, note.durationTicks * tickSeconds * 0.55) :
          note.durationTicks * tickSeconds * 0.96),
        frequencyHz: 440 * Math.pow(2, (note.midi - 69) / 12),
        staccato: note.articulation === 'staccato'
      }));
    return {
      onset: { numerator: onset, denominator: 4 },
      measureId: 'generated-' + String(Math.floor(onset / (score.beats * 4)) + 1),
      targets: items.map(({ note, index }) => ({
        eventId: 'generated-' + index, midi: note.midi, staff: note.staff
      })),
      companion
    };
  });
  return { mode, reason: null, steps };
}
