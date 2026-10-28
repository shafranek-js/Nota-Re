/**
 * Notation boundary for generated exercises.
 *
 * The exercise generator remains the source of pitches for now. This module
 * builds a time-based, UI-independent score for interchange and future OSMD
 * rendering. It deliberately does not depend on React or SVG coordinates.
 */
export type StaffNumber = 1 | 2;
export type SupportedKey = 'C' | 'G' | 'F' | 'D';

export interface ExercisePitch {
  readonly midi: number;
  readonly clef: 'treble' | 'bass';
  /** Duration in quarter-note beats: 1 = quarter, 0.5 = eighth. */
  readonly durMultiplier: number;
  readonly finger?: number;
  readonly articulation?: 'legato' | 'staccato';
  readonly syllable?: string;
}

export interface ScoreEvent {
  readonly midi: number;
  readonly staff: StaffNumber;
  /** Integer time offsets in sixteenth-note ticks. */
  readonly onsetTicks: number;
  readonly durationTicks: number;
  readonly finger?: number;
  readonly articulation?: 'legato' | 'staccato';
  readonly syllable?: string;
}

export interface ExerciseScore {
  readonly title: string;
  readonly fifths: number;
  readonly beats: 4;
  readonly beatType: 4;
  readonly divisions: 4;
  readonly notes: readonly ScoreEvent[];
}

export interface XmlOptions {
  /** Optional pedagogical labels, off by default to keep engraving clean. */
  readonly includeFingering?: boolean;
  readonly includeSyllables?: boolean;
}

const FIFTHS: Record<SupportedKey, number> = { C: 0, G: 1, F: -1, D: 2 };
const TICKS_PER_BAR = 16;

export function createScoreFromExercise(
  exercise: readonly ExercisePitch[],
  tonality: SupportedKey,
  title = 'Nota-Re exercise'
): ExerciseScore {
  if (!exercise.length) throw new Error('Cannot export an empty exercise.');
  if (!(tonality in FIFTHS)) throw new Error('Unsupported tonality.');

  let onsetTicks = 0;
  const notes: ScoreEvent[] = exercise.map((item) => {
    const durationTicks = item.durMultiplier * 4;
    if (!Number.isInteger(durationTicks) || durationTicks <= 0) {
      throw new Error('Durations must be positive multiples of a sixteenth note.');
    }
    if (!Number.isInteger(item.midi) || item.midi < 0 || item.midi > 127) {
      throw new Error('Invalid MIDI pitch.');
    }
    const event: ScoreEvent = {
      midi: item.midi,
      staff: item.clef === 'bass' ? 2 : 1,
      onsetTicks,
      durationTicks,
      finger: item.finger,
      articulation: item.articulation,
      syllable: item.syllable
    };
    onsetTicks += durationTicks;
    return event;
  });

  return { title, fifths: FIFTHS[tonality], beats: 4, beatType: 4, divisions: 4, notes };
}

const DURATIONS: readonly [number, string, boolean][] = [
  [16, 'whole', false],
  [12, 'half', true],
  [8, 'half', false],
  [6, 'quarter', true],
  [4, 'quarter', false],
  [3, 'eighth', true],
  [2, 'eighth', false],
  [1, '16th', false]
];

function chunks(ticks: number): Array<{ duration: number; type: string; dotted: boolean }> {
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error('Invalid tick duration.');
  const result: Array<{ duration: number; type: string; dotted: boolean }> = [];
  let remaining = ticks;
  while (remaining > 0) {
    const found = DURATIONS.find(([duration]) => duration <= remaining);
    if (!found) throw new Error('Could not notate duration.');
    result.push({ duration: found[0], type: found[1], dotted: found[2] });
    remaining -= found[0];
  }
  return result;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function midiPitch(midi: number, fifths: number): string {
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  // Use B-flat rather than A-sharp in F major.
  const pitches: Array<[string, number]> = [
    ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
    ['F', 1], ['G', 0], ['G', 1], ['A', 0],
    fifths === -1 ? ['B', -1] : ['A', 1], ['B', 0]
  ];
  const [step, alter] = pitches[pc];
  return '<pitch><step>' + step + '</step>' +
    (alter !== 0 ? '<alter>' + alter + '</alter>' : '') +
    '<octave>' + octave + '</octave></pitch>';
}

function renderRest(durationTicks: number, staff: StaffNumber): string {
  let xml = '';
  for (const part of chunks(durationTicks)) {
    xml += '<note><rest/><duration>' + part.duration + '</duration><voice>' + staff +
      '</voice><type>' + part.type + '</type>' +
      (part.dotted ? '<dot/>' : '') + '<staff>' + staff + '</staff></note>';
  }
  return xml;
}

function renderEvent(
  event: ScoreEvent,
  startTicks: number,
  endTicks: number,
  fifths: number,
  options: XmlOptions
): string {
  let xml = '';
  let elapsed = 0;
  for (const part of chunks(endTicks - startTicks)) {
    const actualStart = startTicks + elapsed;
    const actualEnd = actualStart + part.duration;
    const tieStop = actualStart > event.onsetTicks;
    const tieStart = actualEnd < event.onsetTicks + event.durationTicks;
    const firstSegment = actualStart === event.onsetTicks;
    let notations = '';
    if (tieStop) notations += '<tied type="stop"/>';
    if (tieStart) notations += '<tied type="start"/>';
    if (firstSegment && event.articulation === 'staccato') {
      notations += '<articulations><staccato/></articulations>';
    }
    if (firstSegment && options.includeFingering && event.finger && event.finger >= 1 && event.finger <= 5) {
      notations += '<technical><fingering>' + event.finger + '</fingering></technical>';
    }

    xml += '<note>' + midiPitch(event.midi, fifths) + '<duration>' + part.duration + '</duration>' +
      (tieStop ? '<tie type="stop"/>' : '') + (tieStart ? '<tie type="start"/>' : '') +
      '<voice>' + event.staff + '</voice><type>' + part.type + '</type>' +
      (part.dotted ? '<dot/>' : '') + '<staff>' + event.staff + '</staff>' +
      (notations ? '<notations>' + notations + '</notations>' : '') +
      (firstSegment && options.includeSyllables && event.syllable
        ? '<lyric><syllabic>single</syllabic><text>' + escapeXml(event.syllable) + '</text></lyric>'
        : '') + '</note>';

    elapsed += part.duration;
  }
  return xml;
}

/** Exports a valid 4/4 two-staff MusicXML score with independent voices. */
export function toMusicXml(score: ExerciseScore, options: XmlOptions = {}): string {
  if (!score.notes.length) throw new Error('Cannot export an empty score.');
  const lastTick = Math.max(...score.notes.map(n => n.onsetTicks + n.durationTicks));
  const measures = Math.ceil(lastTick / TICKS_PER_BAR);
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!DOCTYPE score-partwise  PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    '<score-partwise version="4.0"><work><work-title>' + escapeXml(score.title) +
    '</work-title></work><movement-title>' + escapeXml(score.title) +
    '</movement-title><part-list><score-part id="P1"><part-name>Piano</part-name>' +
    '<part-abbreviation>Pno</part-abbreviation><score-instrument id="I1">' +
    '<instrument-name>Piano</instrument-name></score-instrument>' +
    '<midi-instrument id="I1"><midi-channel>1</midi-channel>' +
    '<midi-program>1</midi-program></midi-instrument></score-part></part-list><part id="P1">';

  for (let bar = 0; bar < measures; bar++) {
    const begin = bar * TICKS_PER_BAR;
    const end = begin + TICKS_PER_BAR;
    xml += '<measure number="' + (bar + 1) + '">';
    if (bar === 0) {
      xml += '<attributes><divisions>' + score.divisions + '</divisions>' +
        '<key><fifths>' + score.fifths + '</fifths></key>' +
        '<time><beats>' + score.beats + '</beats><beat-type>' + score.beatType + '</beat-type></time>' +
        '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>' +
        '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>';
    }

    for (const staff of [1, 2] as const) {
      if (staff === 2) xml += '<backup><duration>' + TICKS_PER_BAR + '</duration></backup>';
      let cursor = begin;
      const staffNotes = score.notes.filter(n => n.staff === staff &&
        n.onsetTicks < end && n.onsetTicks + n.durationTicks > begin)
        .sort((a, b) => a.onsetTicks - b.onsetTicks);

      for (const event of staffNotes) {
        const start = Math.max(begin, event.onsetTicks);
        const finish = Math.min(end, event.onsetTicks + event.durationTicks);
        if (start < cursor) throw new Error('Overlapping notes in one staff are not supported yet.');
        if (start > cursor) xml += renderRest(start - cursor, staff);
        xml += renderEvent(event, start, finish, score.fifths, options);
        cursor = finish;
      }
      if (cursor < end) xml += renderRest(end - cursor, staff);
    }
    xml += '</measure>';
  }
  return xml + '</part></score-partwise>';
}
