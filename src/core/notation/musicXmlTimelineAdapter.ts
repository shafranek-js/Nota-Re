import {
  addQuarter, compareQuarter, normalizeScoreDocument, quarter, quarterDuration,
  type DiatonicStep, type QuarterTime, type ScoreDocument, type ScoreEvent,
  type ScoreMeter, type ScorePitch, type ScoreTempoChange
} from './scoreDocument';

/**
 * A conservative MusicXML partwise -> normalized score adapter.
 *
 * This is independent from OSMD's SVG geometry. Unsupported structures are
 * reported, not flattened into misleading training targets. Preview remains
 * available whether conversion succeeds or not.
 */
export interface MusicXmlTimelineResult {
  readonly score: ScoreDocument | null;
  readonly reason: string | null;
}
class MappingError extends Error {}
const unsupported = (reason: string): never => { throw new MappingError(reason); };
const children = (parent: Element, name: string): Element[] =>
  Array.from(parent.children).filter(node => node.localName === name);
const child = (parent: Element, name: string): Element | null =>
  children(parent, name)[0] ?? null;
const content = (parent: Element | null, name: string): string | null =>
  parent ? child(parent, name)?.textContent?.trim() ?? null : null;
const integer = (value: string | null, name: string, min: number, max: number): number => {
  if (value === null || !/^-?\d+$/.test(value)) return unsupported('Некорректное число: ' + name);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    return unsupported('Недопустимое число: ' + name);
  }
  return number;
};
const tone = (parent: Element): ScorePitch => {
  const pitch = child(parent, 'pitch');
  if (!pitch) return unsupported('Нота без высоты.');
  const step = content(pitch, 'step');
  if (!step || !['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(step)) {
    return unsupported('Неизвестное имя ноты.');
  }
  const alter = content(pitch, 'alter') === null ? 0 :
    integer(content(pitch, 'alter'), 'alter', -2, 2);
  const octave = integer(content(pitch, 'octave'), 'octave', -1, 9);
  const chromatic: Record<DiatonicStep, number> =
    { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (octave + 1) * 12 + chromatic[step as DiatonicStep] + alter;
  if (midi < 0 || midi > 127) return unsupported('Высота выходит за пределы MIDI.');
  return { step: step as DiatonicStep, alter: alter as -2 | -1 | 0 | 1 | 2, octave, midi };
};
const meterFrom = (element: Element): ScoreMeter => {
  const beats = integer(content(element, 'beats'), 'beats', 1, 64);
  const beatType = integer(content(element, 'beat-type'), 'beat-type', 1, 64);
  if (![1, 2, 4, 8, 16, 32, 64].includes(beatType) ||
      children(element, 'beats').length !== 1 || children(element, 'beat-type').length !== 1) {
    return unsupported('Составной или нестандартный музыкальный размер пока не поддерживается.');
  }
  return { beats, beatType: beatType as ScoreMeter['beatType'] };
};
interface PartState {
  divisions: number | null;
  meter: ScoreMeter | null;
  staves: number;
  fifths?: number;
  mode?: 'major' | 'minor';
}
interface ParsedNote {
  event: ScoreEvent;
  startsTie: boolean;
  endsTie: boolean;
}
function parseScore(xml: string, titleFallback: string): ScoreDocument {
  if (typeof DOMParser === 'undefined') return unsupported('XML-парсер браузера недоступен.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return unsupported('Некорректная структура XML.');
  const root = doc.documentElement;
  if (root.localName !== 'score-partwise') {
    return unsupported('Для временной шкалы пока поддерживается только MusicXML score-partwise.');
  }
  // Repeat structures must be expanded musically before a linear timeline can
  // represent performance order. The original score is still rendered by OSMD.
  if (root.querySelector('repeat, ending, multiple-rest, measure-repeat, grace, cue, unpitched, transpose')) {
    return unsupported('Повторы, грации, транспозиция или нетоновые события требуют отдельного адаптера.');
  }
  if (root.querySelector('direction > direction-type > words, sound[dacapo], sound[dalsegno], sound[segno], sound[coda]')) {
    return unsupported('Текстовые переходы и навигация по партитуре пока не интерпретируются.');
  }
  const declared = child(root, 'part-list');
  const partDefs = declared ? children(declared, 'score-part') : [];
  const xmlParts = children(root, 'part');
  if (!partDefs.length || partDefs.length !== xmlParts.length || partDefs.length > 32) {
    return unsupported('Не удалось сопоставить партии партитуры.');
  }
  const ids = new Set<string>();
  const states: PartState[] = [];
  const parts = partDefs.map((part, index) => {
    const id = part.getAttribute('id') || '';
    if (!id || ids.has(id) || xmlParts[index]?.getAttribute('id') !== id) {
      return unsupported('Неоднозначные идентификаторы партий.');
    }
    ids.add(id);
    states.push({ divisions: null, meter: null, staves: 1 });
    return { id, name: content(part, 'part-name') || id, staves: 1 };
  });
  const groups = xmlParts.map(part => children(part, 'measure'));
  const count = groups[0]?.length ?? 0;
  if (count < 1 || count > 5000 || groups.some(measures => measures.length !== count)) {
    return unsupported('Партии имеют разные количества тактов или партитура слишком велика.');
  }
  const measures: ScoreDocument['measures'][number][] = [];
  const events: ParsedNote[] = [];
  const tempos: ScoreTempoChange[] = [];
  let start = quarter(0);
  for (let m = 0; m < count; m++) {
    const measureId = 'measure-' + (m + 1);
    let commonMeter: ScoreMeter | null = null;
    let commonFifths: number | undefined;
    let commonMode: 'major' | 'minor' | undefined;
    let masterExtent = quarter(0);
    let explicitPartial = false;
    let printedNumber = String(m + 1);
    for (const [partIndex, part] of parts.entries()) {
      const measure = groups[partIndex]?.[m];
      if (!measure) return unsupported('Отсутствует такт в партии.');
      const state = states[partIndex]!;
      let cursor = quarter(0);
      let extent = quarter(0);
      let lastNoteOnset: QuarterTime | null = null;
      let seenTimedEvent = false;
      if (partIndex === 0) {
        printedNumber = measure.getAttribute('number') || String(m + 1);
        explicitPartial = measure.getAttribute('implicit') === 'yes';
      } else if ((measure.getAttribute('number') || String(m + 1)) !== printedNumber) {
        return unsupported('Нумерация тактов не совпадает между партиями.');
      }
      for (const element of Array.from(measure.children)) {
        switch (element.localName) {
          case 'attributes': {
            if (seenTimedEvent) return unsupported('Смена размера или делений внутри такта не поддерживается.');
            const divisions = content(element, 'divisions');
            if (divisions !== null) state.divisions = integer(divisions, 'divisions', 1, 100000);
            const time = child(element, 'time');
            if (time) state.meter = meterFrom(time);
            const key = child(element, 'key');
            if (key) {
              const fifths = content(key, 'fifths');
              if (fifths !== null) state.fifths = integer(fifths, 'fifths', -7, 7);
              const mode = content(key, 'mode');
              if (mode !== null) {
                if (mode !== 'major' && mode !== 'minor') return unsupported('Неизвестный лад.');
                state.mode = mode;
              }
            }
            const staves = content(element, 'staves');
            if (staves !== null) {
              const next = integer(staves, 'staves', 1, 32);
              if (m > 0 && next !== state.staves) return unsupported('Изменение количества станов не поддерживается.');
              state.staves = next;
              parts[partIndex]!.staves = next;
            }
            break;
          }
          case 'backup':
          case 'forward': {
            if (!state.divisions) return unsupported('Не указано MusicXML divisions.');
            const distance = quarter(integer(content(element, 'duration'), 'duration', 1, 10000000), state.divisions);
            cursor = element.localName === 'backup' ?
              addQuarter(cursor, quarter(-distance.numerator, distance.denominator)) :
              addQuarter(cursor, distance);
            if (compareQuarter(cursor, quarter(0)) < 0) return unsupported('Backup до начала такта.');
            lastNoteOnset = null;
            seenTimedEvent = true;
            extent = compareQuarter(cursor, extent) > 0 ? cursor : extent;
            break;
          }
          case 'note': {
            if (!state.divisions) return unsupported('Не указано MusicXML divisions.');
            if (child(element, 'grace') || child(element, 'cue') || child(element, 'unpitched')) {
              return unsupported('Грации, cue и ударные ноты требуют отдельного адаптера.');
            }
            const duration = quarter(
              integer(content(element, 'duration'), 'duration', 1, 10000000),
              state.divisions
            );
            const chord = child(element, 'chord') !== null;
            const rest = child(element, 'rest') !== null;
            if (chord && (rest || lastNoteOnset === null)) {
              return unsupported('Аккорд не связан с предыдущей нотой.');
            }
            const onset = chord ? lastNoteOnset! : cursor;
            const end = addQuarter(onset, duration);
            if (!chord) {
              cursor = end;
              lastNoteOnset = onset;
            }
            if (compareQuarter(end, extent) > 0) extent = end;
            const staff = content(element, 'staff') === null ? 1 :
              integer(content(element, 'staff'), 'staff', 1, 32);
            const voice = content(element, 'voice') || '1';
            const tie = children(element, 'tie');
            const notationTies = Array.from(element.getElementsByTagName('tied'));
            const tieTypes = [...tie, ...notationTies].map(t => t.getAttribute('type'));
            if (tieTypes.some(t => t !== 'start' && t !== 'stop')) {
              return unsupported('Неизвестное обозначение связующей лиги.');
            }
            const articulation = element.querySelector('articulations > staccato') ? 'staccato' :
              element.querySelector('articulations > tenuto, articulations > legato') ? 'legato' : undefined;
            const fingerText = element.querySelector('technical > fingering')?.textContent?.trim();
            const finger = fingerText && /^\d$/.test(fingerText) ? Number(fingerText) : undefined;
            events.push({
              event: {
                id: part.id + ':' + measureId + ':n' + (events.length + 1),
                partId: part.id, measureId, staff, voice,
                kind: rest ? 'rest' : 'note', onset: addQuarter(start, onset),
                duration, ...(rest ? {} : { pitch: tone(element) }),
                ...(finger === undefined ? {} : { finger }),
                ...(articulation === undefined ? {} : { articulation })
              },
              startsTie: tieTypes.includes('start'),
              endsTie: tieTypes.includes('stop')
            });
            seenTimedEvent = true;
            if (events.length > 100000) return unsupported('Слишком много нот для структурного анализа.');
            break;
          }
          case 'direction':
          case 'sound': {
            if (element.querySelector('offset')) return unsupported('Смещение темпа требует отдельного адаптера.');
            const sound = element.localName === 'sound' ? element : child(element, 'sound');
            const bpm = sound?.getAttribute('tempo');
            if (bpm !== null && bpm !== undefined) {
              const quarterBpm = Number(bpm);
              if (!Number.isFinite(quarterBpm) || quarterBpm < 10 || quarterBpm > 400) {
                return unsupported('Некорректный темп.');
              }
              tempos.push({ onset: addQuarter(start, cursor), quarterBpm });
            }
            break;
          }
          default:
            break; // barline, print, harmony and layout are still OSMD's domain.
        }
      }
      if (!state.divisions) return unsupported('MusicXML divisions отсутствуют.');
      // A part may inherit the global meter when it does not re-declare it.
      if (!state.meter && commonMeter) state.meter = commonMeter;
      if (!state.meter) return unsupported('Не задан музыкальный размер.');
      if (!commonMeter) commonMeter = state.meter;
      else if (commonMeter.beats !== state.meter.beats ||
               commonMeter.beatType !== state.meter.beatType) {
        return unsupported('Партии имеют разные музыкальные размеры.');
      }
      if (partIndex === 0) {
        commonFifths = state.fifths;
        commonMode = state.mode;
        masterExtent = extent;
      } else if (state.fifths !== undefined && commonFifths !== undefined &&
                 state.fifths !== commonFifths) {
        return unsupported('Партии имеют разные ключевые знаки.');
      }
    }
    if (!commonMeter) return unsupported('Пустая партитура без размера.');
    const normalDuration = quarterDuration(commonMeter);
    let duration = normalDuration;
    if (explicitPartial) {
      if (compareQuarter(masterExtent, quarter(0)) <= 0 ||
          compareQuarter(masterExtent, normalDuration) > 0) {
        return unsupported('Некорректный неполный такт.');
      }
      duration = masterExtent;
    }
    // Per-part timing must fit the shared bar. Otherwise the musical model
    // cannot safely agree with the engraved measure.
    for (const parsed of events) {
      if (parsed.event.measureId !== measureId) continue;
      if (compareQuarter(addQuarter(parsed.event.onset, parsed.event.duration),
          addQuarter(start, duration)) > 0) {
        return unsupported('Ноты выходят за границу такта.');
      }
    }
    measures.push({
      id: measureId, printedNumber, start, duration, meter: commonMeter,
      ...(explicitPartial && compareQuarter(duration, normalDuration) < 0 ? { partial: true } : {}),
      ...(commonFifths === undefined ? {} : { fifths: commonFifths }),
      ...(commonMode === undefined ? {} : { mode: commonMode })
    });
    start = addQuarter(start, duration);
  }
  const tiedFrom = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const entry = events[i]!;
    const event = entry.event;
    if (event.kind !== 'note' && (entry.startsTie || entry.endsTie)) {
      return unsupported('Пауза не может быть связана лигой.');
    }
    const pitch = event.pitch;
    if (!pitch) continue;
    const key = JSON.stringify([
      event.partId, event.staff, event.voice, pitch.step, pitch.alter, pitch.octave
    ]);
    if (entry.endsTie) {
      const from = tiedFrom.get(key);
      if (from === undefined) return unsupported('Не найдена начальная нота лиги.');
      const old = events[from]!.event;
      events[from]!.event = { ...old, tieToId: event.id };
      tiedFrom.delete(key);
    }
    if (entry.startsTie) {
      if (tiedFrom.has(key)) return unsupported('Неоднозначная связующая лига.');
      tiedFrom.set(key, i);
    }
  }
  if (tiedFrom.size) return unsupported('Незавершённая связующая лига.');
  // Multiple parts can duplicate a global tempo indication; equivalent
  // markers are collapsed, conflicting values are rejected.
  const tempoMap = new Map<string, ScoreTempoChange>();
  for (const tempo of tempos) {
    const key = tempo.onset.numerator + '/' + tempo.onset.denominator;
    const prior = tempoMap.get(key);
    if (prior && prior.quarterBpm !== tempo.quarterBpm) {
      return unsupported('Разные темпы одновременно.');
    }
    tempoMap.set(key, tempo);
  }
  return normalizeScoreDocument({
    schemaVersion: 1, id: 'imported-xml', source: 'imported',
    title: titleFallback || content(root, 'movement-title') || 'Импортированная партитура',
    parts, measures, events: events.map(x => x.event), tempos: [...tempoMap.values()]
  });
}

/** Pure mapping: a failure does not prevent OSMD from displaying the file. */
export function mapMusicXmlToScoreDocument(xml: string, titleFallback = 'MusicXML'): MusicXmlTimelineResult {
  try {
    return { score: parseScore(xml, titleFallback), reason: null };
  } catch (error) {
    return {
      score: null,
      reason: error instanceof Error ? error.message : 'Неизвестная структура MusicXML.'
    };
  }
}
