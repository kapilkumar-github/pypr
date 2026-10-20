import { useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  LIGHT_SCHEME_QUERY,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

// Browser-only helpers around the theme preference in localStorage.

const CHANGE_EVENT = 'pypr:theme-change';

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  const theme = resolveTheme(preference, window.matchMedia(LIGHT_SCHEME_QUERY).matches);
  document.documentElement.setAttribute('data-theme', theme);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked (private mode, policy): the choice still applies to this page.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Notifies on a change in this tab, in another tab, or of the OS color scheme. */
export function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia(LIGHT_SCHEME_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    media.removeEventListener('change', onChange);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribeToTheme,
    readThemePreference,
    () => DEFAULT_THEME_PREFERENCE,
  );
}

function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function subscribeToResolvedTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    observer.disconnect();
  };
}

/** The theme actually shown (from <html data-theme>), whatever the preference. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeToResolvedTheme, readResolvedTheme, () => 'dark');
}
