/** 
 * Responsive engraving scale for OSMD's own VexFlow notation.
 *
 * The effective 1.0 legacy scale works on small screens and in the full Studio
 * layout. Zen can spend additional horizontal space on actual glyphs,
 * not just on an empty canvas. Scale is based on the *notation mount*
 * width, not on a hard-coded fraction of viewport height.
 */
export function osmdZoomForWidth(widthPx: number, zen: boolean): number {
  const standard = 1.0;
  if (!zen || !Number.isFinite(widthPx) || widthPx <= 0) return standard;
  // About 1.16 for the 740px tablet notation mount and capped at 1.5
  // from ~960px. Keep 320/375px phones at the established 1.0 scale.
  const scale = Math.max(standard, Math.min(1.5, widthPx / 640));
  return Math.round(scale * 100) / 100;
}
