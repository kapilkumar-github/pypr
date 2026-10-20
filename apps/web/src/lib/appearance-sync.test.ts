import { describe, expect, it } from 'vitest';
import { reconcileAppearance } from './appearance-sync';

const local = (theme: 'dark' | 'light' | 'system', accentColor: string) => ({ theme, accentColor });

describe('reconcileAppearance', () => {
  it("applies the account's choices in a browser that hasn't changed anything", () => {
    const result = reconcileAppearance(
      { theme: 'light', accentColor: '#22D3EE' },
      local('system', '#B7FF3C'),
      null,
    );
    expect(result.apply).toEqual({ theme: 'light', accentColor: '#22D3EE' });
    expect(result.push).toEqual({});
    expect(result.synced).toEqual(local('light', '#22D3EE'));
  });

  it("saves this browser's existing choices to an account that never had any", () => {
    const result = reconcileAppearance(
      { theme: null, accentColor: null },
      local('dark', '#B7FF3C'),
      null,
    );
    // The default accent isn't saved: the account stays "never chosen" for it.
    expect(result.push).toEqual({ theme: 'dark' });
    expect(result.apply).toEqual({});
  });

  it('keeps a change made in this browser since the last sync (e.g. while signed out)', () => {
    const result = reconcileAppearance(
      { theme: 'dark', accentColor: '#22D3EE' },
      local('light', '#22D3EE'),
      local('dark', '#22D3EE'),
    );
    expect(result.push).toEqual({ theme: 'light' });
    expect(result.apply).toEqual({});
  });

  it('takes a change made on another device when this browser has none', () => {
    const result = reconcileAppearance(
      { theme: 'dark', accentColor: '#F472B6' },
      local('dark', '#22D3EE'),
      local('dark', '#22D3EE'),
    );
    expect(result.apply).toEqual({ accentColor: '#F472B6' });
    expect(result.push).toEqual({});
  });
});
