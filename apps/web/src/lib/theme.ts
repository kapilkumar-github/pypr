/**
 * Theme preference. "system" follows the OS and is the default until the user picks Light or
 * Dark (navbar menu or Settings). Stored in localStorage only; the server renders dark and an
 * inline script corrects it before first paint.
 */
export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'dark' | 'light';

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const THEME_STORAGE_KEY = 'pypr-theme';
export const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersLight ? 'light' : 'dark';
  }
  return preference;
}

/**
 * Runs in <head> before the page paints. Must stay in sync with resolveTheme();
 * theme.test.ts runs it against the same cases.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=p==="light"||(p!=="dark"&&matchMedia(${JSON.stringify(
  LIGHT_SCHEME_QUERY,
)}).matches)?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
