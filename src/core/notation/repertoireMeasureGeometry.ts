import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { selectScoreMeasures, type ScoreDocument, type ScoreMeasureRange } from './scoreDocument';

/**
 * OSMD 2.2.1 engraving-only bridge. Source measure identities come from
 * ScoreDocument; x/y/width come exclusively from actual VexFlow staves.
 * We do not infer notehead locations or MIDI pitches from DOM order.
 */
export interface EngravedRepertoireMeasure {
  readonly index: number;
  readonly measureId: string;
  readonly svg: SVGSVGElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type VexStave = {
  getX(): number;
  getWidth(): number;
  getYForLine(line: number): number;
};
type VexMeasure = { getVFStave?: () => VexStave | undefined };

export interface MeasureGeometryResult {
  readonly measures: readonly EngravedRepertoireMeasure[];
  readonly reason: string | null;
}

const fail = (reason: string): MeasureGeometryResult => ({ measures: [], reason });

/**
 * In every graphical system the first StaffLine supplies the ordinal measure
 * sequence; all other StaffLines supply the vertical bounds. Enforce the
 * exact measure count instead of guessing a correspondence on repeats,
 * multirests, hidden measures, or unsupported renderer layouts.
 */
export function locateEngravedMeasures(
  renderer: OpenSheetMusicDisplay,
  mount: HTMLElement,
  score: ScoreDocument
): MeasureGeometryResult {
  const svgPages = mount.querySelectorAll('svg');
  const found: EngravedRepertoireMeasure[] = [];
  for (const [pageIndex, page] of renderer.GraphicSheet.MusicPages.entries()) {
    const svg = svgPages.item(pageIndex);
    if (!(svg instanceof SVGSVGElement)) return fail('OSMD не предоставил SVG для одной из страниц.');
    for (const system of page.MusicSystems) {
      const lines = system.StaffLines;
      if (!lines.length || !lines[0]?.Measures.length) {
        return fail('В нотной системе отсутствуют измеримые такты.');
      }
      const systemMeasures = lines[0].Measures;
      // Every staff must refer to the same number of columns for ordinal
      // indexing to be safe. No partial guesses on irregular layouts.
      if (lines.some(line => line.Measures.length !== systemMeasures.length)) {
        return fail('Нотные станы имеют неодинаковые границы тактов.');
      }
      for (let column = 0; column < systemMeasures.length; column++) {
        if (found.length >= score.measures.length) {
          return fail('OSMD отображает больше тактов, чем содержит музыкальная модель.');
        }
        const measured: { x: number; width: number; top: number; bottom: number }[] = [];
        for (const line of lines) {
          const stave = (line.Measures[column] as VexMeasure | undefined)?.getVFStave?.();
          if (!stave) return fail('Нельзя получить границы такта OSMD.');
          const x = stave.getX(), width = stave.getWidth();
          const y0 = stave.getYForLine(0), y4 = stave.getYForLine(4);
          if (![x, width, y0, y4].every(Number.isFinite) || width < 2) {
            return fail('OSMD вернул некорректную геометрию такта.');
          }
          measured.push({ x, width, top: Math.min(y0, y4), bottom: Math.max(y0, y4) });
        }
        const left = Math.min(...measured.map(m => m.x));
        const right = Math.max(...measured.map(m => m.x + m.width));
        const top = Math.min(...measured.map(m => m.top)) - 12;
        const bottom = Math.max(...measured.map(m => m.bottom)) + 12;
        const measureId = score.measures[found.length]!.id;
        found.push({ index: found.length, measureId, svg,
          x: left, y: top, width: right - left, height: bottom - top });
      }
    }
  }
  if (found.length !== score.measures.length) {
    return fail('Число тактов OSMD не совпадает с музыкальной моделью.');
  }
  return { measures: found, reason: null };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const groupClass = 'repertoire-ab-overlay';

/** Remove only our own overlays; never touch OSMD's engraving. */
export function clearRepertoireMeasureOverlay(mount: HTMLElement): void {
  mount.querySelectorAll('.' + groupClass).forEach(el => el.remove());
}

/**
 * Draw visual measure-highlighting on actual score pages. The source XML,
 * performance timeline, cursor, MIDI scoring and click targets are unchanged.
 * Each SVG overlay is pointer-transparent and aria-hidden.
 */
export function drawRepertoireMeasureOverlay(
  mount: HTMLElement,
  geometry: readonly EngravedRepertoireMeasure[],
  selection: ScoreMeasureRange,
  light: boolean
): number {
  clearRepertoireMeasureOverlay(mount);
  const chosen = new Set(selection.measureIds);
  const layers = new Map<SVGSVGElement, SVGGElement>();
  let painted = 0;
  for (const measure of geometry) {
    if (!chosen.has(measure.measureId)) continue;
    let group = layers.get(measure.svg);
    if (!group) {
      group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', groupClass);
      group.setAttribute('aria-hidden', 'true');
      group.setAttribute('pointer-events', 'none');
      // Appending the lightweight overlay does not replace a single notehead.
      measure.svg.appendChild(group);
      layers.set(measure.svg, group);
    }
    const rectangle = document.createElementNS(SVG_NS, 'rect');
    rectangle.setAttribute('data-repertoire-measure', measure.measureId);
    rectangle.setAttribute('x', String(measure.x));
    rectangle.setAttribute('y', String(measure.y));
    rectangle.setAttribute('width', String(measure.width));
    rectangle.setAttribute('height', String(measure.height));
    rectangle.setAttribute('rx', '3');
    rectangle.setAttribute('fill', light ? '#0284c7' : '#38bdf8');
    rectangle.setAttribute('fill-opacity', light ? '0.13' : '0.20');
    rectangle.setAttribute('stroke', light ? '#0369a1' : '#7dd3fc');
    rectangle.setAttribute('stroke-opacity', '0.65');
    rectangle.setAttribute('stroke-width', '1.5');
    group.appendChild(rectangle);
    if (measure.measureId === selection.fromMeasureId ||
        measure.measureId === selection.throughMeasureId) {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('data-repertoire-boundary',
        measure.measureId === selection.fromMeasureId ? 'A' : 'B');
      label.setAttribute('x', String(measure.measureId === selection.fromMeasureId ?
        measure.x + 6 : measure.x + measure.width - 6));
      label.setAttribute('y', String(measure.y + 14));
      label.setAttribute('text-anchor', measure.measureId === selection.fromMeasureId ? 'start' : 'end');
      label.setAttribute('font-size', '13');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', light ? '#075985' : '#e0f2fe');
      label.textContent = measure.measureId === selection.fromMeasureId ? 'A' : 'B';
      group.appendChild(label);
    }
    painted++;
  }
  return painted;
}

export function selectMeasureIndices(
  score: ScoreDocument, fromIndex: number, throughIndex: number
): ScoreMeasureRange | null {
  if (!Number.isSafeInteger(fromIndex) || !Number.isSafeInteger(throughIndex) ||
      fromIndex < 0 || throughIndex < fromIndex || throughIndex >= score.measures.length) {
    return null;
  }
  return selectScoreMeasures(score,
    score.measures[fromIndex]!.id, score.measures[throughIndex]!.id);
}
