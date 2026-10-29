/**
 * Responsive VexFlow engraving scale (never a CSS transform).
 *
 * VexFlow's native 10px interline at zoom 1 is not changed by OSMD's
 * BetweenStaffLinesDistance rule. At a desktop-wide 1440px score, Classic's
 * measured interline is about 19.7px; OSMD targets 19.2px via zoom=1.92.
 * Smaller screens keep readable, unwrapped engraving rather than allowing
 * large zoom to create additional systems.
 */
export function osmdZoomForWidth(widthPx: number, zen: boolean): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 1;
  const scale = zen
    ? Math.max(1, Math.min(2.0, widthPx / 640))
    : Math.max(1, Math.min(1.92, 1 + (widthPx - 960) * 0.92 / 480));
  return Math.round(scale * 100) / 100;
}
