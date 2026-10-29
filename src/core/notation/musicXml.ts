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
  /** Suppress only filler rests on a staff that has no notes anywhere in the score. */
  readonly hideInactiveStaffRests?: boolean;
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

/**
 * Build a truly simultaneous two-hand score from independent monophonic
 * timelines. Each hand starts at tick zero and advances by its own durations.
 * The lower staff is not delayed by the notes in the upper staff.
 *
 * Chords within one hand can be supplied directly as explicit ScoreEvents;
 * this adapter deliberately keeps the existing ExercisePitch input simple.
 */
export function createScoreFromHands(
  rightHand: readonly ExercisePitch[],
  leftHand: readonly ExercisePitch[],
  tonality: SupportedKey,
  title = 'Nota-Re two-hand exercise'
): ExerciseScore {
  if (!rightHand.length && !leftHand.length) {
    throw new Error('Cannot export an empty exercise.');
  }
  if (!(tonality in FIFTHS)) throw new Error('Unsupported tonality.');

  function collect(hand: readonly ExercisePitch[], staff: StaffNumber): ScoreEvent[] {
    let onsetTicks = 0;
    return hand.map(item => {
      const durationTicks = item.durMultiplier * 4;
      if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) {
        throw new Error('Durations must be positive multiples of a sixteenth note.');
      }
      if (!Number.isInteger(item.midi) || item.midi < 0 || item.midi > 127) {
        throw new Error('Invalid MIDI pitch.');
      }
      const event: ScoreEvent = {
        midi: item.midi,
        staff,
        onsetTicks,
        durationTicks,
        finger: item.finger,
        articulation: item.articulation,
        syllable: item.syllable
      };
      onsetTicks += durationTicks;
      return event;
    });
  }

  return {
    title,
    fifths: FIFTHS[tonality],
    beats: 4,
    beatType: 4,
    divisions: 4,
    notes: [...collect(rightHand, 1), ...collect(leftHand, 2)]
      .sort((a, b) => a.onsetTicks - b.onsetTicks || a.staff - b.staff)
  };
}

/**
 * A hand-part event placed at an explicit musical timestamp, in sixteenth
 * ticks. Gaps are intentional RESTS; unlike createScoreFromHands, the first
 * event need not start at zero and each hand has its own rests/timeline.
 *
 * Chords at the same onset are legal only when they have equal durations.
 * Overlapping non-chord notes within one hand require a multi-voice model
 * and are rejected instead of silently engraving corrupt timing.
 */
export type TimedHandPitch = Omit<ScoreEvent, 'staff'>;

export function createScoreFromTimedHands(
  rightHand: readonly TimedHandPitch[],
  leftHand: readonly TimedHandPitch[],
  tonality: SupportedKey,
  title = 'Nota-Re independent hands'
): ExerciseScore {
  if (!rightHand.length && !leftHand.length) throw new Error('Cannot export an empty exercise.');
  if (!(tonality in FIFTHS)) throw new Error('Unsupported tonality.');

  function collect(hand: readonly TimedHandPitch[], staff: StaffNumber): ScoreEvent[] {
    const sorted = [...hand].sort((a, b) => a.onsetTicks - b.onsetTicks || a.midi - b.midi);
    let previousEnd = 0;
    let chordOnset = -1;
    let chordDuration = -1;
    const chordPitches = new Set<number>();
    for (const note of sorted) {
      if (!Number.isSafeInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
          !Number.isSafeInteger(note.onsetTicks) || note.onsetTicks < 0 ||
          !Number.isSafeInteger(note.durationTicks) || note.durationTicks <= 0 ||
          !Number.isSafeInteger(note.onsetTicks + note.durationTicks)) {
        throw new Error('Invalid MIDI pitch or sixteenth-note timeline.');
      }
      if (note.onsetTicks === chordOnset) {
        if (note.durationTicks !== chordDuration || chordPitches.has(note.midi)) {
          throw new Error('Chord notes must be unique and share a duration.');
        }
        chordPitches.add(note.midi);
      } else {
        if (note.onsetTicks < previousEnd) {
          throw new Error('Overlapping notes within one staff require separate voices.');
        }
        chordOnset = note.onsetTicks;
        chordDuration = note.durationTicks;
        chordPitches.clear();
        chordPitches.add(note.midi);
        previousEnd = note.onsetTicks + note.durationTicks;
      }
    }
    return sorted.map(note => ({ ...note, staff }));
  }

  return {
    title,
    fifths: FIFTHS[tonality],
    beats: 4,
    beatType: 4,
    divisions: 4,
    notes: [...collect(rightHand, 1), ...collect(leftHand, 2)]
      .sort((a, b) => a.onsetTicks - b.onsetTicks || a.staff - b.staff || a.midi - b.midi)
  };
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

function renderRest(durationTicks: number, staff: StaffNumber, hidden = false): string {
  let xml = '';
  for (const part of chunks(durationTicks)) {
    xml += (hidden ? '<note print-object="no">' : '<note>') + '<rest/><duration>' + part.duration + '</duration><voice>' + staff +
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
      const silentStaff = !!options.hideInactiveStaffRests && !score.notes.some(note => note.staff === staff);
      if (staff === 2) xml += '<backup><duration>' + TICKS_PER_BAR + '</duration></backup>';
      let cursor = begin;
      const staffNotes = score.notes.filter(n => n.staff === staff &&
        n.onsetTicks < end && n.onsetTicks + n.durationTicks > begin)
        .sort((a, b) => a.onsetTicks - b.onsetTicks);

      // Events with identical onsets and durations form a chord. MusicXML
      // requires <chord/> on every note following the first at each rhythmic
      // segment; those notes must not advance the staff's musical time.
      for (let i = 0; i < staffNotes.length;) {
        const event = staffNotes[i];
        const chord = [event];
        i++;
        while (i < staffNotes.length && staffNotes[i].onsetTicks === event.onsetTicks) {
          const next = staffNotes[i++];
          if (next.durationTicks !== event.durationTicks) {
            throw new Error('Simultaneous notes on one staff must share a duration.');
          }
          chord.push(next);
        }
        const start = Math.max(begin, event.onsetTicks);
        const finish = Math.min(end, event.onsetTicks + event.durationTicks);
        if (start < cursor) throw new Error('Overlapping notes in one staff are not supported yet.');
        if (start > cursor) xml += renderRest(start - cursor, staff, silentStaff);
        let segmentStart = start;
        for (const part of chunks(finish - start)) {
          const segmentEnd = segmentStart + part.duration;
          for (let j = 0; j < chord.length; j++) {
            const noteXml = renderEvent(chord[j], segmentStart, segmentEnd, score.fifths, options);
            xml += j === 0 ? noteXml : noteXml.replace('<note>', '<note><chord/>');
          }
          segmentStart = segmentEnd;
        }
        cursor = finish;
      }
      if (cursor < end) xml += renderRest(end - cursor, staff, silentStaff);
    }
    xml += '</measure>';
  }
  return xml + '</part></score-partwise>';
}
