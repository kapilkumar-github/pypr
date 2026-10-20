import { describe, expect, it } from 'vitest';
import {
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  themeInitScript,
} from './theme';

type Script = (...globals: unknown[]) => void;

/** Compiles the <head> script with the given browser globals as parameters. */
function compileInitScript(...globals: string[]): Script {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs our own constant
  return new Function(...globals, themeInitScript) as Script;
}

/** Runs the <head> script against fake browser globals and returns the data-theme it set. */
function runInitScript(stored: string | null, systemPrefersLight: boolean): string | undefined {
  const attributes: Record<string, string> = {};
  const localStorage = {
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
  };
  const matchMedia = () => ({ matches: systemPrefersLight });
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  compileInitScript('localStorage', 'matchMedia', 'document')(localStorage, matchMedia, document);
  return attributes['data-theme'];
}

describe('parseThemePreference', () => {
  it('accepts known values', () => {
    for (const value of THEME_PREFERENCES) expect(parseThemePreference(value)).toBe(value);
  });

  it('falls back to system (follow the OS) for missing or unknown values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('blue')).toBe('system');
    expect(parseThemePreference(1)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('uses explicit choices as they are', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('follows the OS for system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});

describe('themeInitScript', () => {
  const stored = [null, 'garbage', ...THEME_PREFERENCES];

  it.each(stored.flatMap((value) => [true, false].map((light) => [value, light] as const)))(
    'matches resolveTheme for stored=%s, systemPrefersLight=%s',
    (value, light) => {
      expect(runInitScript(value, light)).toBe(resolveTheme(parseThemePreference(value), light));
    },
  );

  it('does not throw when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => {
      compileInitScript('localStorage')(blocked);
    }).not.toThrow();
  });
});
