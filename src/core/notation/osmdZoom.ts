/** 
 * Responsive engraving scale for OSMD's own VexFlow notation.
 *
 * The 0.8 legacy scale works on small screens and in the full Studio
 * layout. Zen can spend additional horizontal space on actual glyphs,
 * not just on an empty canvas. Scale is based on the *notation mount*
 * width, not on a hard-coded fraction of viewport height.
 */
export function osmdZoomForWidth(widthPx: number, zen: boolean): number {
  const standard = 0.8;
  if (!zen || !Number.isFinite(widthPx) || widthPx <= 0) return standard;
  // About 0.96 at a 768px score and 1.5 once 1200px is available.
  // Keep 320px layouts at the established scale to avoid horizontal clipping.
  const scale = Math.max(standard, Math.min(1.5, widthPx / 800));
  return Math.round(scale * 100) / 100;
}
