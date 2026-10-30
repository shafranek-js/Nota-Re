import type { TimedTone } from '../audio/audioTimeline.ts';
import { addQuarter, compareQuarter,
  type QuarterTime, type ScoreDocument, type ScoreEvent, type ScoreMeasureRange
} from './scoreDocument.ts';

/**
 * A–B transport is local playback, never MIDI performance evidence.
 * The returned timetable uses audio seconds, but all source positions remain
 * exact reduced fractions until tempo integration.
 */
export interface ScoreLoopAudio {
  readonly tones: readonly TimedTone[];
  readonly periodSeconds: number;
  readonly audibleNoteCount: number;
}

const asNumber = (q: QuarterTime): number => q.numerator / q.denominator;

function bpmAt(score: ScoreDocument, at: QuarterTime, defaultBpm: number): number {
  let bpm = defaultBpm;
  for (const change of score.tempos) {
    if (compareQuarter(change.onset, at) > 0) break;
    bpm = change.quarterBpm;
  }
  return bpm;
}

/** Integrate score time through exact tempo-change boundaries. */
function scoreSeconds(
  score: ScoreDocument, from: QuarterTime, to: QuarterTime, defaultBpm: number
): number {
  if (compareQuarter(from, to) >= 0) return 0;
  let time = from;
  let bpm = bpmAt(score, from, defaultBpm);
  let seconds = 0;
  for (const change of score.tempos) {
    if (compareQuarter(change.onset, from) <= 0) continue;
    if (compareQuarter(change.onset, to) >= 0) break;
    const beats = asNumber(change.onset) - asNumber(time);
    seconds += beats * 60 / bpm;
    time = change.onset;
    bpm = change.quarterBpm;
  }
  seconds += (asNumber(to) - asNumber(time)) * 60 / bpm;
  return seconds;
}

const endOf = (event: ScoreEvent): QuarterTime =>
  addQuarter(event.onset, event.duration);

export function buildScoreLoopAudio(
  score: ScoreDocument, range: ScoreMeasureRange, defaultBpm = 80
): ScoreLoopAudio {
  if (!Number.isFinite(defaultBpm) || defaultBpm < 20 || defaultBpm > 240) {
    throw new Error('Темп воспроизведения должен быть от 20 до 240 BPM.');
  }
  if (compareQuarter(range.start, range.end) >= 0 ||
      !score.measures.some(m => m.id === range.fromMeasureId && compareQuarter(m.start, range.start) === 0) ||
      !score.measures.some(m => m.id === range.throughMeasureId &&
        compareQuarter(addQuarter(m.start, m.duration), range.end) === 0)) {
    throw new Error('Диапазон A–B не совпадает с исходной партитурой.');
  }
  const periodSeconds = scoreSeconds(score, range.start, range.end, defaultBpm);
  if (!Number.isFinite(periodSeconds) || periodSeconds <= 0 || periodSeconds > 900) {
    throw new Error('Диапазон A–B слишком длинный для непрерывного воспроизведения.');
  }
  const byId = new Map(score.events.map(e => [e.id, e]));
  const continuedIds = new Set(score.events.flatMap(e => e.tieToId ? [e.tieToId] : []));
  const tones: TimedTone[] = [];

  for (const event of score.events) {
    if (event.kind !== 'note' || !event.pitch || continuedIds.has(event.id)) continue;
    let end = endOf(event);
    let tail = event;
    let hops = 0;
    // A tie is one sounding note. A continuation has no new attack.
    while (tail.tieToId) {
      const next = byId.get(tail.tieToId);
      if (!next || next.kind !== 'note' || ++hops > score.events.length) {
        throw new Error('Некорректная связующая лига в партитуре.');
      }
      end = endOf(next);
      tail = next;
    }
    if (compareQuarter(end, range.start) <= 0 ||
        compareQuarter(event.onset, range.end) >= 0) continue;
    const clippedStart = compareQuarter(event.onset, range.start) < 0 ? range.start : event.onset;
    const clippedEnd = compareQuarter(end, range.end) > 0 ? range.end : end;
    const offset = scoreSeconds(score, range.start, clippedStart, defaultBpm);
    const duration = scoreSeconds(score, clippedStart, clippedEnd, defaultBpm);
    if (duration <= 0) continue;
    const frequencyHz = 440 * Math.pow(2, (event.pitch.midi - 69) / 12);
    tones.push({
      offsetSeconds: offset,
      durationSeconds: event.articulation === 'staccato' ?
        Math.min(0.12, duration * 0.55) : duration * 0.96,
      frequencyHz,
      staccato: event.articulation === 'staccato'
    });
  }
  tones.sort((a, b) => a.offsetSeconds - b.offsetSeconds ||
    a.frequencyHz - b.frequencyHz);
  if (tones.length > 5000) throw new Error('Слишком много нот для повторяемого диапазона.');
  return Object.freeze({
    tones: Object.freeze(tones),
    periodSeconds,
    audibleNoteCount: tones.length
  });
}
