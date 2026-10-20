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

/** Where the app accent's CSS variables are cached (see app-accent.ts). */
export const ACCENT_STORAGE_KEY = 'pypr-accent';
/** Values the first-paint script accepts for --app-* variables: hex or rgb() with alpha. */
export const ACCENT_VAR_VALUE = String.raw`^(#[0-9A-F]{6}|rgb\(\d{1,3} \d{1,3} \d{1,3} \/ \d{1,3}%\))$`;

/**
 * Runs in <head> before the page paints: sets data-theme, then the app accent's cached CSS
 * variables (only --app-* names with hex or rgb() values, so storage can't inject anything
 * else). Must stay in sync with resolveTheme(); theme.test.ts runs it against the same cases.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=p==="light"||(p!=="dark"&&matchMedia(${JSON.stringify(
  LIGHT_SCHEME_QUERY,
)}).matches)?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(
  ACCENT_STORAGE_KEY,
)})||"null"),v=a&&a.vars,ok=new RegExp(${JSON.stringify(
  ACCENT_VAR_VALUE,
)});if(v&&typeof v==="object"){for(var k in v){if(/^--app-[a-z-]+$/.test(k)&&ok.test(v[k]))document.documentElement.style.setProperty(k,v[k])}}}catch(e){}})()`;
