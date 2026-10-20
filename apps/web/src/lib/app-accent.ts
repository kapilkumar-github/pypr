import { DEFAULT_APP_ACCENT } from '@pypr/validation';
import { ensureContrast, hexToRgb, isHexColor, readableTextOn } from '@pypr/templates';
import { useSyncExternalStore } from 'react';
import { ACCENT_STORAGE_KEY } from './theme';

/**
 * The app accent (decision D28): the Pypr interface's own color, chosen in Settings. It's
 * applied as --app-* CSS variables on <html>, which the theme tokens in globals.css fall back
 * from, so it never reaches a resume (resumes have their own accent).
 */

export { ACCENT_STORAGE_KEY };
/** Names the first-paint script may set; anything else in storage is ignored. */
export const APP_ACCENT_VARS = [
  '--app-accent',
  '--app-accent-ink',
  '--app-highlight-dark',
  '--app-highlight-light',
  '--app-glow',
  '--app-glow-light',
] as const;
type AccentVar = (typeof APP_ACCENT_VARS)[number];

/** Panel colors the thin indicators must stand out against (see globals.css). */
const DARK_SURFACE = '#11151D';
const LIGHT_SURFACE = '#FFFFFF';

const rgba = (hex: string, percent: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${String(r)} ${String(g)} ${String(b)} / ${String(percent)}%)`;
};

/**
 * CSS variables for an accent: the fill, readable text on it, and indicator shades with at least
 * 3:1 contrast on each theme's panels. The default accent sets nothing, so the hand-tuned
 * defaults in globals.css apply (ink indicators on light, where lime would vanish).
 */
export function appAccentVars(hex: string): Partial<Record<AccentVar, string>> {
  if (!isHexColor(hex)) return {};
  const accent = hex.toUpperCase();
  if (accent === DEFAULT_APP_ACCENT) return {};
  const onDark = ensureContrast(accent, DARK_SURFACE, 3);
  const onLight = ensureContrast(accent, LIGHT_SURFACE, 3);
  return {
    '--app-accent': accent,
    '--app-accent-ink': readableTextOn(accent),
    '--app-highlight-dark': onDark,
    '--app-highlight-light': onLight,
    '--app-glow': rgba(accent, 22),
    '--app-glow-light': rgba(onLight, 25),
  };
}

// Browser-only helpers.

const CHANGE_EVENT = 'pypr:accent-change';

export function readAppAccent(): string {
  try {
    const stored = JSON.parse(localStorage.getItem(ACCENT_STORAGE_KEY) ?? 'null') as {
      hex?: unknown;
    } | null;
    return typeof stored?.hex === 'string' && isHexColor(stored.hex)
      ? stored.hex.toUpperCase()
      : DEFAULT_APP_ACCENT;
  } catch {
    return DEFAULT_APP_ACCENT;
  }
}

export function applyAppAccent(hex: string): void {
  const vars = appAccentVars(hex);
  const style = document.documentElement.style;
  for (const name of APP_ACCENT_VARS) {
    const value = vars[name];
    if (value) style.setProperty(name, value);
    else style.removeProperty(name);
  }
}

/** Applies the accent on this device and remembers it for the next first paint. */
export function setAppAccent(hex: string): void {
  const accent = isHexColor(hex) ? hex.toUpperCase() : DEFAULT_APP_ACCENT;
  try {
    localStorage.setItem(
      ACCENT_STORAGE_KEY,
      JSON.stringify({ hex: accent, vars: appAccentVars(accent) }),
    );
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  applyAppAccent(accent);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACCENT_STORAGE_KEY) {
      applyAppAccent(readAppAccent());
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAppAccent(): string {
  return useSyncExternalStore(subscribe, readAppAccent, () => DEFAULT_APP_ACCENT);
}
