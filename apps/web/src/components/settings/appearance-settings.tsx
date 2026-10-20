'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AccentPicker } from '@/components/accent-picker';
import { CheckIcon } from '@/components/icons';
import { setAppAccent, useAppAccent } from '@/lib/app-accent';
import { saveAppearance } from '@/lib/appearance-sync';
import type { ThemePreference } from '@/lib/theme';
import { ThemeSwitcher } from './theme-switcher';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Settings > Appearance: the Pypr interface's theme and accent, saved to the account (decision
 * D28). Resumes keep their own accent, font and density (editor > Templates).
 */
export function AppearanceSettings() {
  const accent = useAppAccent();
  const [state, setState] = useState<SaveState>('idle');
  const themeHeading = useId();
  const accentHeading = useId();
  const pendingAccent = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(pendingAccent.current);
    },
    [],
  );

  const save = (patch: Parameters<typeof saveAppearance>[0]) => {
    setState('saving');
    saveAppearance(patch).then(
      () => {
        setState('saved');
      },
      () => {
        setState('error');
      },
    );
  };

  const changeAccent = (hex: string) => {
    // Applies at once; saving waits until the user stops dragging the color picker.
    window.clearTimeout(pendingAccent.current);
    setState('saving');
    setAppAccent(hex);
    pendingAccent.current = window.setTimeout(() => {
      save({ accentColor: hex });
    }, 400);
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-ink-muted">
            How Pypr looks for you, on every device you sign in on. Each resume keeps its own
            accent, font and spacing.
          </p>
        </div>
        <SaveStatus state={state} />
      </header>

      <section aria-labelledby={themeHeading}>
        <h3 id={themeHeading} className="text-sm font-medium">
          Theme
        </h3>
        <p className="mt-1 mb-4 text-xs text-ink-subtle">
          System follows your device&apos;s light or dark setting.
        </p>
        <ThemeSwitcher
          onSelect={(theme: ThemePreference) => {
            save({ theme });
          }}
        />
      </section>

      <section aria-labelledby={accentHeading} className="border-t border-line pt-8">
        <h3 id={accentHeading} className="sr-only">
          App accent
        </h3>
        <AccentPicker legend="App accent color" value={accent} onChange={changeAccent}>
          <AppAccentSample />
        </AccentPicker>
      </section>
    </div>
  );
}

/** The accent as the app uses it: a primary button, a focus ring, a selected tab. */
function AppAccentSample() {
  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-canvas p-4"
      aria-hidden="true"
    >
      <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink">
        Primary action
      </span>
      <span className="rounded-md border border-line px-3 py-1.5 text-xs ring-2 ring-highlight">
        Focused
      </span>
      <span className="border-b-2 border-highlight pb-1 text-xs font-medium">Selected tab</span>
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  return (
    <p className="min-h-5 text-xs text-ink-subtle" aria-live="polite">
      {state === 'saving' && 'Saving…'}
      {state === 'saved' && (
        <span className="inline-flex items-center gap-1">
          <CheckIcon className="h-3.5 w-3.5 text-highlight" />
          Saved to your account
        </span>
      )}
      {state === 'error' && (
        <span className="text-danger">
          Couldn&apos;t save to your account. It&apos;s applied on this device and will sync next
          time.
        </span>
      )}
    </p>
  );
}
