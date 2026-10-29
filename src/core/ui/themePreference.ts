/** App-wide appearance is independent of trainer progress and hardware. */
export type AppTheme = 'dark' | 'light';
export const APP_THEME_KEY = 'notare-theme-v1';

export function readAppTheme(): AppTheme {
  try {
    return globalThis.localStorage?.getItem(APP_THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveAppTheme(theme: AppTheme): void {
  try { globalThis.localStorage?.setItem(APP_THEME_KEY, theme); }
  catch { /* Storage is optional; live theme still works. */ }
}
