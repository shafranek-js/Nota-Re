/**
 * Renderer-independent score facts for repertoire and future polyphonic drills.
 *
 * Times are exact rational QUARTER NOTES, never pixels or floating-point beats.
 * No existing course scoring, MIDI or OSMD renderer is changed by this module.
 * Parsing imported XML and grading are separate, capability-gated stages.
 */
export interface QuarterTime {
  readonly numerator: number;
  readonly denominator: number;
}

export interface ScoreMeter {
  readonly beats: number;
  readonly beatType: 1 | 2 | 4 | 8 | 16 | 32 | 64;
}

export interface ScorePart {
  readonly id: string;
  readonly name: string;
  readonly staves: number;
}

export interface ScoreMeasure {
  readonly id: string;
  readonly printedNumber: string;
  /** Global score time at the beginning of this occurrence. */
  readonly start: QuarterTime;
  readonly duration: QuarterTime;
  readonly meter: ScoreMeter;
  /** Pickup, deliberately shortened final bar, etc. */
  readonly partial?: boolean;
  readonly fifths?: number;
  readonly mode?: 'major' | 'minor';
}

export type DiatonicStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface ScorePitch {
  readonly step: DiatonicStep;
  /** Musical spelling, including the accidental, independent of MIDI key. */
  readonly alter: -2 | -1 | 0 | 1 | 2;
  readonly octave: number;
  readonly midi: number;
}

export interface ScoreEvent {
  readonly id: string;
  readonly partId: string;
  readonly measureId: string;
  /** One-based within the parent part. */
  readonly staff: number;
  /** Independent voice identity, never inferred from staff number. */
  readonly voice: string;
  readonly kind: 'note' | 'rest';
  readonly onset: QuarterTime;
  readonly duration: QuarterTime;
  readonly pitch?: ScorePitch;
  /** Forward link to the *next* notated segment of the same held note. */
  readonly tieToId?: string;
  readonly finger?: number;
  readonly articulation?: 'legato' | 'staccato';
}

export interface ScoreTempoChange {
  readonly onset: QuarterTime;
  /** Quarter notes per minute; not dotted-quarter BPM. */
  readonly quarterBpm: number;
}

export interface ScoreDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly source: 'generated' | 'imported';
  readonly parts: readonly ScorePart[];
  readonly measures: readonly ScoreMeasure[];
  readonly events: readonly ScoreEvent[];
  readonly tempos: readonly ScoreTempoChange[];
}

export interface ScoreMeasureRange {
  readonly fromMeasureId: string;
  readonly throughMeasureId: string;
  readonly measureIds: readonly string[];
  readonly eventIds: readonly string[];
  /** Source timestamps are unchanged: a selection is never a mutated score. */
  readonly start: QuarterTime;
  readonly end: QuarterTime;
}

/** Untrusted input is *not* equivalent to a proved MIDI note-on. */
export type InputEvidence =
  | { readonly source: 'midi'; readonly timestampMs: number; readonly midi: number; readonly channel: number;
      readonly calibratedLatencyMs: number | null }
  | { readonly source: 'pc'; readonly timestampMs: number; readonly midi: number;
      readonly calibratedLatencyMs: number | null }
  | { readonly source: 'microphone'; readonly timestampMs: number; readonly midi: number | null;
      readonly confidence: number; readonly calibratedLatencyMs: number | null }
  | { readonly source: 'assisted'; readonly timestampMs: number; readonly midi: null };

export interface ScoreCapability {
  /** Eligibility only; actual OSMD load/render must be confirmed separately. */
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

export interface ScoreCapabilities {
  readonly display: ScoreCapability;
  readonly teachingOverlays: ScoreCapability;
  readonly performanceAssessment: ScoreCapability;
}

export class ScoreDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreDocumentError';
  }
}

function fail(message: string): never { throw new ScoreDocumentError(message); }

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) { const next = a % b; a = b; b = next; }
  return a || 1n;
}

function fraction(n: bigint, d: bigint): QuarterTime {
  if (d <= 0n) return fail('Quarter time denominator must be positive.');
  const divisor = gcd(n, d);
  n /= divisor;
  d /= divisor;
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ||
      d > BigInt(Number.MAX_SAFE_INTEGER)) {
    return fail('Quarter time exceeds safe integer precision.');
  }
  return Object.freeze({ numerator: Number(n), denominator: Number(d) });
}

export function quarter(numerator: number, denominator = 1): QuarterTime {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    return fail('Quarter time must contain safe integers with a positive denominator.');
  }
  return fraction(BigInt(numerator), BigInt(denominator));
}

function exact(time: QuarterTime): QuarterTime {
  if (!time || !Number.isSafeInteger(time.numerator) ||
      !Number.isSafeInteger(time.denominator) || time.denominator <= 0) {
    return fail('Invalid quarter time.');
  }
  return quarter(time.numerator, time.denominator);
}

export function addQuarter(a: QuarterTime, b: QuarterTime): QuarterTime {
  const x = exact(a), y = exact(b);
  return fraction(BigInt(x.numerator) * BigInt(y.denominator) +
    BigInt(y.numerator) * BigInt(x.denominator),
    BigInt(x.denominator) * BigInt(y.denominator));
}

export function compareQuarter(a: QuarterTime, b: QuarterTime): -1 | 0 | 1 {
  const x = exact(a), y = exact(b);
  const left = BigInt(x.numerator) * BigInt(y.denominator);
  const right = BigInt(y.numerator) * BigInt(x.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function quarterDuration(meter: ScoreMeter): QuarterTime {
  if (!Number.isSafeInteger(meter.beats) || meter.beats < 1 || meter.beats > 64 ||
      ![1, 2, 4, 8, 16, 32, 64].includes(meter.beatType)) {
    return fail('Unsupported time signature.');
  }
  return quarter(meter.beats * 4, meter.beatType);
}

const NATURAL_PITCH: Record<DiatonicStep, number> =
  { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function checkPitch(pitch: ScorePitch, id: string): ScorePitch {
  if (!pitch || !(pitch.step in NATURAL_PITCH) ||
      !Number.isSafeInteger(pitch.alter) || pitch.alter < -2 || pitch.alter > 2 ||
      !Number.isSafeInteger(pitch.octave) ||
      !Number.isSafeInteger(pitch.midi) || pitch.midi < 0 || pitch.midi > 127 ||
      (pitch.octave + 1) * 12 + NATURAL_PITCH[pitch.step] + pitch.alter !== pitch.midi) {
    return fail('Invalid enharmonic pitch for event ' + id + '.');
  }
  return Object.freeze({ ...pitch });
}

function uniqueId(id: string, kind: string, seen: Set<string>): void {
  if (typeof id !== 'string' || !id.trim() || seen.has(id)) {
    fail('Missing or duplicate ' + kind + ' identifier: ' + id);
  }
  seen.add(id);
}

const textLimit = (value: string, name: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) {
    return fail('Invalid ' + name + '.');
  }
  return value;
};

function checkTempo(change: ScoreTempoChange, lastEnd: QuarterTime): ScoreTempoChange {
  const onset = exact(change.onset);
  if (compareQuarter(onset, quarter(0)) < 0 || compareQuarter(onset, lastEnd) >= 0 ||
      !Number.isFinite(change.quarterBpm) || change.quarterBpm < 10 || change.quarterBpm > 400) {
    return fail('Invalid tempo change.');
  }
  return Object.freeze({ onset, quarterBpm: change.quarterBpm });
}

/**
 * Return a validated immutable snapshot (not a rewrite of source MusicXML).
 * All intervals are half-open [onset, end); chord notes have equal lengths.
 */
export function normalizeScoreDocument(input: ScoreDocument): ScoreDocument {
  if (input.schemaVersion !== 1 || !['generated', 'imported'].includes(input.source)) {
    return fail('Unsupported score schema/source.');
  }
  const id = textLimit(input.id, 'score ID');
  const title = textLimit(input.title, 'score title');
  if (!input.parts.length || !input.measures.length) return fail('Score has no parts/measures.');

  const partIds = new Set<string>();
  const parts = input.parts.map(part => {
    uniqueId(part.id, 'part', partIds);
    if (!Number.isSafeInteger(part.staves) || part.staves < 1 || part.staves > 32) {
      return fail('Invalid staff count in part ' + part.id + '.');
    }
    return Object.freeze({ id: part.id, name: textLimit(part.name, 'part name'), staves: part.staves });
  });
  const partMap = new Map(parts.map(part => [part.id, part]));

  const measureIds = new Set<string>();
  let nextStart = quarter(0);
  const measures = input.measures.map(measure => {
    uniqueId(measure.id, 'measure', measureIds);
    const start = exact(measure.start);
    const duration = exact(measure.duration);
    const expected = quarterDuration(measure.meter);
    if (compareQuarter(start, nextStart) !== 0 ||
        compareQuarter(duration, quarter(0)) <= 0 ||
        (measure.partial ? compareQuarter(duration, expected) > 0 :
          compareQuarter(duration, expected) !== 0)) {
      return fail('Non-contiguous or invalid measure duration: ' + measure.id + '.');
    }
    if (measure.fifths !== undefined && (!Number.isSafeInteger(measure.fifths) ||
        measure.fifths < -7 || measure.fifths > 7)) {
      return fail('Invalid key signature in measure ' + measure.id + '.');
    }
    if (measure.mode !== undefined && !['major', 'minor'].includes(measure.mode)) {
      return fail('Invalid key mode in measure ' + measure.id + '.');
    }
    nextStart = addQuarter(start, duration);
    return Object.freeze({ ...measure, start, duration,
      meter: Object.freeze({ ...measure.meter }),
      printedNumber: textLimit(measure.printedNumber, 'printed measure number') });
  });
  const measureMap = new Map(measures.map(measure => [measure.id, measure]));
  const eventIds = new Set<string>();
  const events = input.events.map(event => {
    uniqueId(event.id, 'event', eventIds);
    const part = partMap.get(event.partId);
    const measure = measureMap.get(event.measureId);
    if (!part || !measure || !Number.isSafeInteger(event.staff) ||
        event.staff < 1 || event.staff > part.staves ||
        typeof event.voice !== 'string' || !event.voice.trim() ||
        event.voice.length > 50) {
      return fail('Invalid part/staff/voice/measure for event ' + event.id + '.');
    }
    const onset = exact(event.onset);
    const duration = exact(event.duration);
    const end = addQuarter(onset, duration);
    if (compareQuarter(duration, quarter(0)) <= 0 ||
        compareQuarter(onset, measure.start) < 0 ||
        compareQuarter(onset, addQuarter(measure.start, measure.duration)) >= 0 ||
        compareQuarter(end, addQuarter(measure.start, measure.duration)) > 0) {
      return fail('Event is outside its measure or crosses a barline: ' + event.id + '.');
    }
    if (!['note', 'rest'].includes(event.kind) ||
        (event.kind === 'note' && !event.pitch) ||
        (event.kind === 'rest' && (event.pitch || event.tieToId))) {
      return fail('Invalid note/rest event ' + event.id + '.');
    }
    if (event.finger !== undefined && (!Number.isSafeInteger(event.finger) ||
        event.finger < 1 || event.finger > 5)) return fail('Invalid finger for ' + event.id + '.');
    if (event.articulation !== undefined &&
        !['legato', 'staccato'].includes(event.articulation)) {
      return fail('Invalid articulation for ' + event.id + '.');
    }
    return Object.freeze({ ...event, onset, duration,
      ...(event.pitch ? { pitch: checkPitch(event.pitch, event.id) } : {}) });
  });

  const byVoice = new Map<string, typeof events>();
  for (const event of events) {
    const key = JSON.stringify([event.partId, event.staff, event.voice]);
    const voiceEvents = byVoice.get(key);
    if (voiceEvents) voiceEvents.push(event);
    else byVoice.set(key, [event]);
  }
  for (const voiceEvents of byVoice.values()) {
    const ordered = [...voiceEvents].sort((a, b) => compareQuarter(a.onset, b.onset) ||
      (a.pitch?.midi ?? -1) - (b.pitch?.midi ?? -1));
    let chordOnset: QuarterTime | null = null;
    let chordEnd = quarter(0);
    const chordPitches = new Set<number>();
    for (const event of ordered) {
      const end = addQuarter(event.onset, event.duration);
      if (chordOnset !== null && compareQuarter(event.onset, chordOnset) === 0) {
        if (event.kind !== 'note' || compareQuarter(end, chordEnd) !== 0 ||
            chordPitches.has(event.pitch!.midi)) {
          return fail('Duplicate pitches, rests or unequal durations in chord at ' + event.id + '.');
        }
        chordPitches.add(event.pitch!.midi);
      } else {
        if (compareQuarter(event.onset, chordEnd) < 0) {
          return fail('Overlapping events within the same voice: ' + event.id + '.');
        }
        chordOnset = event.onset;
        chordEnd = end;
        chordPitches.clear();
        if (event.pitch) chordPitches.add(event.pitch.midi);
      }
    }
  }

  const byId = new Map(events.map(event => [event.id, event]));
  const tieTargets = new Set<string>();
  for (const event of events) {
    if (!event.tieToId) continue;
    const next = byId.get(event.tieToId);
    if (event.kind !== 'note' || !next || next.kind !== 'note' ||
        event.id === next.id || tieTargets.has(next.id) ||
        event.partId !== next.partId || event.staff !== next.staff ||
        event.voice !== next.voice || event.pitch!.midi !== next.pitch!.midi ||
        event.pitch!.step !== next.pitch!.step || event.pitch!.alter !== next.pitch!.alter ||
        event.pitch!.octave !== next.pitch!.octave ||
        compareQuarter(addQuarter(event.onset, event.duration), next.onset) !== 0) {
      return fail('Invalid tied-note continuation from ' + event.id + '.');
    }
    tieTargets.add(next.id);
  }

  const tempos = [...input.tempos].map(change => checkTempo(change, nextStart))
    .sort((a, b) => compareQuarter(a.onset, b.onset));
  for (let i = 1; i < tempos.length; i++) {
    if (compareQuarter(tempos[i - 1]!.onset, tempos[i]!.onset) === 0) {
      return fail('Duplicate tempo at same onset.');
    }
  }
  return Object.freeze({
    schemaVersion: 1 as const, id, title, source: input.source,
    parts: Object.freeze(parts), measures: Object.freeze(measures),
    events: Object.freeze(events), tempos: Object.freeze(tempos)
  });
}

export function selectScoreMeasures(
  score: ScoreDocument, fromMeasureId: string, throughMeasureId: string
): ScoreMeasureRange {
  const startIndex = score.measures.findIndex(m => m.id === fromMeasureId);
  const endIndex = score.measures.findIndex(m => m.id === throughMeasureId);
  if (startIndex < 0 || endIndex < startIndex) return fail('Invalid A–B measure range.');
  const selected = score.measures.slice(startIndex, endIndex + 1);
  const ids = new Set(selected.map(m => m.id));
  return Object.freeze({
    fromMeasureId, throughMeasureId,
    measureIds: Object.freeze(selected.map(m => m.id)),
    eventIds: Object.freeze(score.events.filter(event => ids.has(event.measureId))
      .map(event => event.id)),
    start: selected[0]!.start,
    end: addQuarter(selected[selected.length - 1]!.start,
      selected[selected.length - 1]!.duration)
  });
}

/**
 * Not an OSMD load test, grading adapter or instructional-feature promise.
 * Imported scores remain explicitly view-only until later milestones.
 */
export function getScoreCapabilities(score: ScoreDocument): ScoreCapabilities {
  const imported = score.source === 'imported';
  const display: ScoreCapability = { eligible: true, reasons: Object.freeze([
    'Renderer eligibility only; actual MusicXML/OSMD loading must succeed.'
  ]) };
  const teachingOverlays: ScoreCapability = { eligible: false, reasons: Object.freeze([
    imported ? 'Imported voice-to-note overlay mapping is not implemented.' :
      'Normalized events are not yet connected to the existing lesson overlays.'
  ]) };
  const performanceAssessment: ScoreCapability = { eligible: false, reasons: Object.freeze([
    imported ? 'Imported repertoire is view-only; grading is disabled.' :
      'Normalized events are not yet connected to the certified assessment engine.'
  ]) };
  return Object.freeze({ display: Object.freeze(display),
    teachingOverlays: Object.freeze(teachingOverlays),
    performanceAssessment: Object.freeze(performanceAssessment) });
}

/** Eligibility for verified pitch input, never a certification decision. */
export function isUsablePitchEvidence(evidence: InputEvidence): boolean {
  if (!Number.isFinite(evidence.timestampMs) || evidence.timestampMs < 0 ||
      (evidence.source !== 'assisted' &&
        evidence.calibratedLatencyMs !== null &&
        (!Number.isFinite(evidence.calibratedLatencyMs) ||
          evidence.calibratedLatencyMs < 0))) return false;
  if (evidence.source === 'assisted') return false;
  if (evidence.source === 'microphone') {
    return evidence.midi !== null && Number.isSafeInteger(evidence.midi) &&
      evidence.midi >= 0 && evidence.midi <= 127 &&
      Number.isFinite(evidence.confidence) && evidence.confidence >= 0.9 &&
      evidence.confidence <= 1;
  }
  return Number.isSafeInteger(evidence.midi) && evidence.midi >= 0 &&
    evidence.midi <= 127 && (evidence.source !== 'midi' ||
      (Number.isSafeInteger(evidence.channel) && evidence.channel >= 0 && evidence.channel <= 15));
}
