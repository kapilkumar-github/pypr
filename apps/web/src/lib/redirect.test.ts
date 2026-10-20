import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/resumes/abc?tab=preview', '/resumes/abc?tab=preview'],
  ])('keeps same-site path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    'javascript:alert(1)',
    'dashboard',
  ])('falls back for %j', (input) => {
    expect(safeNextPath(input)).toBe('/dashboard');
  });
});
