import { describe, expect, it } from 'vitest';
import { updateAppearanceRequestSchema } from './appearance.js';

describe('updateAppearanceRequestSchema', () => {
  it('accepts either field and normalizes the accent to uppercase hex', () => {
    expect(updateAppearanceRequestSchema.parse({ theme: 'light' })).toEqual({ theme: 'light' });
    expect(updateAppearanceRequestSchema.parse({ accentColor: '#a78bfa' })).toEqual({
      accentColor: '#A78BFA',
    });
  });

  it('refuses empty bodies, unknown themes, invalid colors and extra fields', () => {
    for (const body of [
      {},
      { theme: 'blue' },
      { accentColor: 'red' },
      { accentColor: '#12' },
      { theme: 'dark', font: 'georgia' },
    ]) {
      expect(updateAppearanceRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(
        false,
      );
    }
  });
});
