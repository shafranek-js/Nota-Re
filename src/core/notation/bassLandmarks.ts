/**
 * Fixed pitch anchors on a standard five-line bass (F) clef.
 *
 * VexFlow Stave.getYForLine() is zero-based from the TOP line:
 * A3=0, F3=1, D3=2, B2=3, G2=4.
 * OSMD/VexFlow own the actual staff geometry and layout.
 */
export const BASS_LANDMARKS = [
  { pitch: 'F3', lineFromTop: 1, label: 'Фа3 · F3', description: '4-я линейка снизу' },
  { pitch: 'G2', lineFromTop: 4, label: 'Соль2 · G2', description: '1-я линейка снизу' }
] as const;

export interface BassStaffGeometry {
  x: number;
  width: number;
  lineY: (lineFromTop: number) => number;
}

/** Return verified staff-line spans, never guessed y positions from the UI. */
export function getBassLandmarkSegments(staff: BassStaffGeometry) {
  if (!Number.isFinite(staff.x) || !Number.isFinite(staff.width) || staff.width <= 0) {
    return [];
  }
  return BASS_LANDMARKS.flatMap(landmark => {
    const y = staff.lineY(landmark.lineFromTop);
    return Number.isFinite(y)
      ? [{ ...landmark, x1: staff.x, x2: staff.x + staff.width, y }]
      : [];
  });
}
