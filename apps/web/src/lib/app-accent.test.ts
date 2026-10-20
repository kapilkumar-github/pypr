import { contrastRatio } from '@pypr/templates';
import { describe, expect, it } from 'vitest';
import { APP_ACCENT_VARS, appAccentVars } from './app-accent';
import { ACCENT_STORAGE_KEY, ACCENT_VAR_VALUE, themeInitScript } from './theme';

describe('appAccentVars', () => {
  it('sets nothing for the default lime, so the tuned CSS defaults apply', () => {
    expect(appAccentVars('#B7FF3C')).toEqual({});
    expect(appAccentVars('#b7ff3c')).toEqual({});
    expect(appAccentVars('not a color')).toEqual({});
  });

  it('keeps fills and indicators readable on both themes', () => {
    for (const accent of ['#A78BFA', '#22D3EE', '#1E3A8A', '#FFFF00', '#111111', '#FF7A6B']) {
      const vars = appAccentVars(accent);
      expect(Object.keys(vars).sort()).toEqual([...APP_ACCENT_VARS].sort());
      expect(vars['--app-accent']).toBe(accent);
      expect(contrastRatio(accent, vars['--app-accent-ink'] ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(vars['--app-highlight-dark'] ?? '', '#11151D')).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrastRatio(vars['--app-highlight-light'] ?? '', '#FFFFFF')).toBeGreaterThanOrEqual(
        3,
      );
      const pattern = new RegExp(ACCENT_VAR_VALUE);
      for (const value of Object.values(vars)) expect(value).toMatch(pattern);
    }
  });
});

/** Runs the first-paint script with a stored accent and returns the variables it set. */
function runWithStoredAccent(stored: string | null): Record<string, string> {
  const set: Record<string, string> = {};
  const localStorage = { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? stored : null) };
  const document = {
    documentElement: {
      setAttribute: () => undefined,
      style: {
        setProperty: (name: string, value: string) => {
          set[name] = value;
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs our own constant
  const run = new Function('localStorage', 'matchMedia', 'document', themeInitScript) as (
    ...args: unknown[]
  ) => void;
  run(localStorage, () => ({ matches: false }), document);
  return set;
}

describe('first-paint script: app accent', () => {
  it('applies the cached variables', () => {
    const vars = appAccentVars('#A78BFA');
    expect(runWithStoredAccent(JSON.stringify({ hex: '#A78BFA', vars }))).toEqual(vars);
  });

  it('ignores anything else that may be in storage', () => {
    const tampered = JSON.stringify({
      vars: {
        '--app-accent': 'red; background: url(https://evil.example)',
        '--color-ink': '#000000',
        '--app-glow': 'rgb(1 2 3 / 4%)',
      },
    });
    expect(runWithStoredAccent(tampered)).toEqual({ '--app-glow': 'rgb(1 2 3 / 4%)' });
    expect(runWithStoredAccent('{not json')).toEqual({});
    expect(runWithStoredAccent(null)).toEqual({});
  });
});
