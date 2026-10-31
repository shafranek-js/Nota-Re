import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { compareQuarter, type ScoreDocument, type ScoreEvent, type ScoreMeasureRange } from './scoreDocument';
import type { EngravedRepertoireMeasure } from './repertoireMeasureGeometry';

/**
 * Conservative one-to-one matching between a normalized MusicXML note event
 * and a *real* OSMD/VexFlow notehead. OSMD 2.2.1's sourceNote.halfTone is
 * twelve semitones below MIDI (as documented in OSMD's note-timing tutorial).
 * No geometric guessing, interpolation, or chord-index assumptions.
 */
export interface RepertoireNoteAnchor {
  readonly eventId: string;
  readonly measureId: string;
  readonly root: SVGSVGElement;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}
export interface RepertoireNoteMapping {
  readonly anchors: readonly RepertoireNoteAnchor[];
  readonly total: number;
  readonly reason: string | null;
}

type GraphicalNoteWithSvg = {
  sourceNote: {
    halfTone: number;
    isRest: () => boolean;
    ParentStaff: { idInMusicSheet: number };
  };
  getSVGGElement?: () => SVGElement | undefined;
};

const noteheadClass = '.vf-notehead';
const overlayClass = 'repertoire-notehead-overlay';
const NS = 'http://www.w3.org/2000/svg';
const TIME_EPSILON = 0.0000004;

function scoreTime(event: ScoreEvent): number {
  return event.onset.numerator / event.onset.denominator;
}

function svgHeadCenter(element: SVGGraphicsElement): {
  root: SVGSVGElement; x: number; y: number; radius: number
} | null {
  const root = element.closest('svg');
  if (!(root instanceof SVGSVGElement)) return null;
  const rect = element.getBoundingClientRect();
  const transform = root.getScreenCTM();
  if (!transform || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
      rect.width < 1 || rect.height < 1) return null;
  try {
    const topLeft = root.createSVGPoint(), bottomRight = root.createSVGPoint();
    topLeft.x = rect.left;
    topLeft.y = rect.top;
    bottomRight.x = rect.right;
    bottomRight.y = rect.bottom;
    const a = topLeft.matrixTransform(transform.inverse());
    const b = bottomRight.matrixTransform(transform.inverse());
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const radius = Math.max(5, Math.min(14, Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 0.8));
    if (![x, y, radius].every(Number.isFinite)) return null;
    return { root, x, y, radius };
  } catch {
    return null;
  }
}

/**
 * Only one-part scores are currently eligible: OSMD uses global staff indices
 * and partwise multi-part ordinal mapping is not verified here.
 *
 * A duplicate (time, staff, MIDI) across voices is inherently ambiguous and
 * makes the entire mapping unavailable, even if the SVG visually looks fine.
 * It is better to show no colored noteheads than highlight the wrong voice.
 */
export function mapRepertoireNoteheads(
  osmd: OpenSheetMusicDisplay,
  mount: HTMLElement,
  score: ScoreDocument,
  measures: readonly EngravedRepertoireMeasure[]
): RepertoireNoteMapping {
  const notes = score.events.filter(event => event.kind === 'note');
  const unavailable = (reason: string): RepertoireNoteMapping =>
    ({ anchors: [], total: notes.length, reason });
  if (score.parts.length !== 1) return unavailable('Точная привязка отдельных нот нескольких партий пока не проверена.');
  if (notes.length === 0 || notes.length > 5000) return unavailable('Нет нот или партитура слишком велика для инспектора.');
  if (measures.length !== score.measures.length) return unavailable('Границы тактов OSMD не подтверждены.');
  const geometry = new Map(measures.map(item => [item.measureId, item]));

  const ordered = [...notes].sort((a, b) =>
    compareQuarter(a.onset, b.onset) || a.staff - b.staff ||
    (a.pitch?.midi ?? -1) - (b.pitch?.midi ?? -1));
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1]!, b = ordered[i]!;
    if (Math.abs(scoreTime(a) - scoreTime(b)) > 0 &&
        Math.abs(scoreTime(a) - scoreTime(b)) < TIME_EPSILON * 3) {
      return unavailable('Соседние события слишком близки для надёжной привязки курсора.');
    }
    if (Math.abs(scoreTime(a) - scoreTime(b)) < TIME_EPSILON &&
        a.staff === b.staff && a.pitch?.midi === b.pitch?.midi) {
      return unavailable('Две одинаковые ноты в разных голосах невозможно различить однозначно.');
    }
  }

  const cursor = osmd.cursor;
  if (!cursor?.Iterator) return unavailable('OSMD не предоставил нотный курсор.');
  const anchors: RepertoireNoteAnchor[] = [];
  const usedSource = new Set<string>();
  const usedSvg = new Set<Element>();
  let position = 0, steps = 0;

  try {
    cursor.reset();
    // OSMD cursors can include empty time positions. Never loop indefinitely.
    const maxSteps = Math.min(50000, notes.length * 8 + 512);
    while (!cursor.Iterator.EndReached && steps++ < maxSteps) {
      const timestamp = cursor.Iterator.currentTimeStamp.RealValue * 4;
      if (!Number.isFinite(timestamp)) return unavailable('OSMD вернул некорректное время ноты.');
      while (position < ordered.length && scoreTime(ordered[position]!) < timestamp - TIME_EPSILON) {
        // A required source time did not occur in the rendered cursor.
        return unavailable('Не найдена нотная позиция на временной шкале OSMD.');
      }
      const atTime: ScoreEvent[] = [];
      let next = position;
      while (next < ordered.length &&
             Math.abs(scoreTime(ordered[next]!) - timestamp) <= TIME_EPSILON) {
        atTime.push(ordered[next]!);
        next++;
      }

      const gNotes = cursor.GNotesUnderCursor() as GraphicalNoteWithSvg[];
      for (const g of gNotes) {
        if (g.sourceNote.isRest()) continue;
        const staffZero = g.sourceNote.ParentStaff?.idInMusicSheet;
        const midi = g.sourceNote.halfTone + 12;
        if (!Number.isSafeInteger(staffZero) || !Number.isSafeInteger(midi)) {
          return unavailable('OSMD не предоставил точную высоту или стан.');
        }
        const matching = atTime.filter(event =>
          event.staff === staffZero + 1 && event.pitch?.midi === midi &&
          !usedSource.has(event.id));
        if (matching.length !== 1) {
          return unavailable('Нельзя однозначно сопоставить голос и высоту ноты OSMD.');
        }
        const event = matching[0]!;
        const group = g.getSVGGElement?.();
        if (!group || !mount.contains(group)) return unavailable('SVG-группа нотной головки отсутствует.');
        const heads = group.querySelectorAll<SVGGraphicsElement>(noteheadClass);
        if (heads.length !== 1 || usedSvg.has(heads[0]!)) {
          return unavailable('Аккордная головка или SVG-группа неоднозначна.');
        }
        const anchor = svgHeadCenter(heads[0]!);
        const bar = geometry.get(event.measureId);
        if (!anchor || !bar || bar.svg !== anchor.root ||
            anchor.x < bar.x - 8 || anchor.x > bar.x + bar.width + 8) {
          return unavailable('Нотная головка не находится в подтверждённом такте.');
        }
        usedSource.add(event.id);
        usedSvg.add(heads[0]!);
        anchors.push({ eventId: event.id, measureId: event.measureId,
          root: anchor.root, x: anchor.x, y: anchor.y, radius: anchor.radius });
      }
      position = next;
      cursor.next();
    }
  } catch {
    return unavailable('OSMD не смог предоставить устойчивые координаты нот.');
  } finally {
    try { cursor.hide(); } catch { /* not yet initialized */ }
  }
  if (steps >= Math.min(50000, notes.length * 8 + 512) && !cursor.Iterator.EndReached) {
    return unavailable('Превышен безопасный лимит обхода нот OSMD.');
  }
  if (anchors.length !== notes.length || usedSource.size !== notes.length) {
    return unavailable('OSMD и MusicXML содержат разное количество распознаваемых нот.');
  }
  return { anchors, total: notes.length, reason: null };
}

export function clearRepertoireNoteOverlay(mount: HTMLElement): void {
  mount.querySelectorAll('.' + overlayClass).forEach(el => el.remove());
}

/** Draw only verified noteheads from selected source measure IDs. */
export function drawRepertoireNoteOverlay(
  mount: HTMLElement,
  mapping: RepertoireNoteMapping,
  range: ScoreMeasureRange,
  light: boolean
): number {
  clearRepertoireNoteOverlay(mount);
  if (mapping.reason) return 0;
  const included = new Set(range.measureIds);
  const layers = new Map<SVGSVGElement, SVGGElement>();
  let count = 0;
  for (const note of mapping.anchors) {
    if (!included.has(note.measureId)) continue;
    let layer = layers.get(note.root);
    if (!layer) {
      layer = document.createElementNS(NS, 'g');
      layer.setAttribute('class', overlayClass);
      layer.setAttribute('pointer-events', 'none');
      layer.setAttribute('aria-hidden', 'true');
      note.root.appendChild(layer);
      layers.set(note.root, layer);
    }
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('data-repertoire-note', note.eventId);
    ring.setAttribute('cx', String(note.x));
    ring.setAttribute('cy', String(note.y));
    ring.setAttribute('r', String(note.radius));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', light ? '#0369a1' : '#7dd3fc');
    ring.setAttribute('stroke-width', '2');
    layer.appendChild(ring);
    count++;
  }
  return count;
}

const trialTargetClass = 'repertoire-trial-target';

/** A single cursor over an OSMD-verified anchor; never synthesize coordinates. */
export function clearRepertoireTrialTarget(mount: HTMLElement): void {
  mount.querySelectorAll('.' + trialTargetClass).forEach(element => element.remove());
}

export function drawRepertoireTrialTarget(
  mount: HTMLElement, mapping: RepertoireNoteMapping,
  eventId: string, light: boolean
): boolean {
  clearRepertoireTrialTarget(mount);
  if (mapping.reason) return false;
  const anchor = mapping.anchors.find(item => item.eventId === eventId);
  if (!anchor || !mount.contains(anchor.root)) return false;
  const group = document.createElementNS(NS, 'g');
  group.setAttribute('class', trialTargetClass);
  group.setAttribute('pointer-events', 'none');
  group.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('data-repertoire-trial-target', eventId);
  ring.setAttribute('cx', String(anchor.x));
  ring.setAttribute('cy', String(anchor.y));
  ring.setAttribute('r', String(anchor.radius + 4));
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', light ? '#b45309' : '#fbbf24');
  ring.setAttribute('stroke-width', '3');
  group.appendChild(ring);
  anchor.root.appendChild(group);
  return true;
}
