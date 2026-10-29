/**
 * Shared renderer preference for the Studio and the technical status bar.
 * Keep the established storage key so previously selected renderers survive.
 */
export type ScoreRenderer = 'osmd' | 'legacy';
export const SCORE_RENDERER_STORAGE_KEY = 'notare-score-renderer-v1';

export function readScoreRendererPreference(): ScoreRenderer {
  try {
    return localStorage.getItem(SCORE_RENDERER_STORAGE_KEY) === 'legacy' ? 'legacy' : 'osmd';
  } catch {
    return 'osmd';
  }
}

export function saveScoreRendererPreference(renderer: ScoreRenderer): void {
  try {
    localStorage.setItem(SCORE_RENDERER_STORAGE_KEY, renderer);
  } catch {
    // Storage is optional (private mode, blocked storage, etc.).
  }
}
