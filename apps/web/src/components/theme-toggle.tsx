'use client';

import { MoonIcon, SunIcon } from '@/components/icons';
import { setThemePreference, useResolvedTheme } from '@/lib/theme-store';

/**
 * Navbar theme toggle: shows the theme on screen and switches to the other one. Until it is
 * used (or a theme is picked in Settings), the theme follows the OS. Uses the same preference
 * store as Settings, so the choice is saved and applied everywhere.
 */
export function ThemeToggle() {
  const resolved = useResolvedTheme();
  const next = resolved === 'light' ? 'dark' : 'light';
  const Icon = resolved === 'light' ? SunIcon : MoonIcon;

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        setThemePreference(next);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
