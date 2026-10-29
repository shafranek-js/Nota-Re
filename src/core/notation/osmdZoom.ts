/**
 * Responsive OSMD engraving scale. Use genuine VexFlow engraving (not a
 * transformed SVG) so cursor coordinates, masks and overlays stay aligned.
 *
 * Standard Studio scales up on wide screens without sacrificing the existing
 * readable 1.0 phone/tablet baseline. Zen preserves its larger focus zoom.
 */
export function osmdZoomForWidth(widthPx: number, zen: boolean): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 1;
  const scale = zen
    ? Math.max(1, Math.min(1.5, widthPx / 640))
    : Math.max(1, Math.min(1.45, widthPx / 960));
  return Math.round(scale * 100) / 100;
}
