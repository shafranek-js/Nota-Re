import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

/**
 * OSMD 2.2.1 / VexFlow engraving adapter.
 *
 * The rest of Nota-Re must not know about the .vf-notehead selector or
 * internal getSVGGElement() and getVFStave() methods. These are version-specific
 * and guarded. Missing geometry triggers the existing Classic fallback instead
 * of inventing a staff position.
 *
 * Keep this contract covered by real Chrome overlay tests before upgrading.
 */
export interface EngravedPoint {
  x: number;
  y: number;
  root: SVGSVGElement;
}

export interface BassStaveGeometry {
  root: SVGSVGElement;
  x: number;
  width: number;
  lineY: (lineFromTop: number) => number;
}

const NOTEHEAD_SELECTOR = '.vf-notehead, [class*="notehead"], [id*="notehead"]';

export function validEngravedRect(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): boolean {
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
    rect.width >= 1 && rect.height >= 1;
}

export function positionCursorAtTicks(renderer: OpenSheetMusicDisplay, onsetTicks: number): void {
  const cursor = renderer.cursor;
  const targetTime = onsetTicks / 16;
  cursor.reset();
  let steps = 0;
  while (!cursor.Iterator.EndReached &&
         cursor.Iterator.currentTimeStamp.RealValue + 0.000001 < targetTime &&
         steps < 512) {
    cursor.next();
    steps++;
  }
  cursor.show();
}

/** Pitch-based notehead position, excluding rests on the other staff. */
export function getEngravedNotePoint(
  renderer: OpenSheetMusicDisplay,
  mount: HTMLElement,
  onsetTicks: number
): EngravedPoint | null {
  positionCursorAtTicks(renderer, onsetTicks);
  for (const graphicalNote of renderer.cursor.GNotesUnderCursor()) {
    if (graphicalNote.sourceNote.isRest()) continue;
    const vexflowNote = graphicalNote as typeof graphicalNote & {
      getSVGGElement?: () => SVGElement | undefined;
    };
    const element = vexflowNote.getSVGGElement?.();
    if (!element || !mount.contains(element)) continue;
    const root = element.closest('svg') as SVGSVGElement | null;
    if (!root) continue;
    const head = element.querySelector<SVGGraphicsElement>(NOTEHEAD_SELECTOR) ?? element;
    const rect = head.getBoundingClientRect();
    const matrix = root.getScreenCTM();
    if (!matrix || !validEngravedRect(rect)) continue;
    try {
      const center = root.createSVGPoint();
      center.x = rect.left + rect.width / 2;
      center.y = rect.top + rect.height / 2;
      const local = center.matrixTransform(matrix.inverse());
      if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) continue;
      return { x: local.x, y: local.y, root };
    } catch {
      continue; // Non-invertible matrix is not a valid anchor.
    }
  }
  return null;
}

/** Five-line treble staves for positioning measure labels above OSMD systems. */
export function getTrebleStaveGeometries(
  renderer: OpenSheetMusicDisplay,
  mount: HTMLElement
): BassStaveGeometry[] {
  return getPianoStaveGeometries(renderer, mount, 0);
}

/** Verified five-line bass staves, one span per OSMD music system. */
export function getBassStaveGeometries(
  renderer: OpenSheetMusicDisplay,
  mount: HTMLElement
): BassStaveGeometry[] {
  return getPianoStaveGeometries(renderer, mount, 1);
}

function getPianoStaveGeometries(
  renderer: OpenSheetMusicDisplay,
  mount: HTMLElement,
  staffIndex: 0 | 1
): BassStaveGeometry[] {
  type VexStave = {
    getX: () => number;
    getWidth: () => number;
    getYForLine: (index: number) => number;
  };
  type VexMeasure = { getVFStave?: () => VexStave };
  const geometries: BassStaveGeometry[] = [];
  const svgPages = mount.querySelectorAll('svg');
  renderer.GraphicSheet.MusicPages.forEach((page, pageIndex) => {
    const svg = svgPages.item(pageIndex);
    if (!(svg instanceof SVGSVGElement)) return;
    page.MusicSystems.forEach(system => {
      // MusicXML two-staff piano layout: treble 0, bass 1.
      if (system.StaffLines.length !== 2) return;
      const stave = system.StaffLines[staffIndex];
      if (stave.ParentStaff.StafflineCount !== 5) return;
      const measures = stave.Measures;
      if (!measures.length) return;
      const first = (measures[0] as VexMeasure).getVFStave?.();
      const last = (measures[measures.length - 1] as VexMeasure).getVFStave?.();
      if (!first || !last) return;
      const x = first.getX();
      const width = last.getX() + last.getWidth() - x;
      if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return;
      const lineY = (lineFromTop: number) => first.getYForLine(lineFromTop);
      // Invalid VexFlow coordinates are never converted into fake overlays.
      if (![0, 1, 2, 3, 4].every(line => Number.isFinite(lineY(line)))) return;
      geometries.push({ root: svg, x, width, lineY });
    });
  });
  return geometries;
}

/** Actual VexFlow measure starts; labels use these instead of guessing note spacing. */
export interface EngravedMeasureStart {
  root: SVGSVGElement;
  number: number;
  x: number;
  top: number;
}

export function getTrebleMeasureStarts(
  renderer: OpenSheetMusicDisplay,
  mount: HTMLElement
): EngravedMeasureStart[] {
  type Stave = {
    getX: () => number;
    getYForLine: (line: number) => number;
  };
  type Measure = { getVFStave?: () => Stave };
  const result: EngravedMeasureStart[] = [];
  const svgs = mount.querySelectorAll('svg');
  let number = 0;
  renderer.GraphicSheet.MusicPages.forEach((page, pageIndex) => {
    const root = svgs.item(pageIndex);
    if (!(root instanceof SVGSVGElement)) return;
    page.MusicSystems.forEach(system => {
      const treble = system.StaffLines[0];
      if (!treble || treble.ParentStaff.StafflineCount !== 5) return;
      treble.Measures.forEach(measure => {
        number++;
        const stave = (measure as Measure).getVFStave?.();
        if (!stave) return;
        const x = stave.getX();
        const top = stave.getYForLine(0);
        if (Number.isFinite(x) && Number.isFinite(top)) {
          result.push({ root, number, x, top });
        }
      });
    });
  });
  return result;
}
