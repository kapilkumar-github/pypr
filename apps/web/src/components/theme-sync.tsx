'use client';

import { useEffect } from 'react';
import { applyThemePreference, readThemePreference, subscribeToTheme } from '@/lib/theme-store';

/**
 * Keeps <html data-theme> in step after the first paint: when the OS scheme changes
 * (for the "system" preference) or the preference changes in another tab.
 */
export function ThemeSync() {
  useEffect(
    () =>
      subscribeToTheme(() => {
        applyThemePreference(readThemePreference());
      }),
    [],
  );
  return null;
}
