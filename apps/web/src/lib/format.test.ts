import { describe, expect, it } from 'vitest';
import { timeAgo } from './format';

const now = Date.parse('2026-10-20T12:00:00Z');

describe('timeAgo', () => {
  it.each([
    ['2026-10-20T11:59:30Z', 'just now'],
    ['2026-10-20T11:57:00Z', '3 minutes ago'],
    ['2026-10-19T12:00:00Z', 'yesterday'],
    ['2026-09-20T12:00:00Z', 'last month'],
  ])('%s -> %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});
