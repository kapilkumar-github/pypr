import { describe, expect, it } from 'vitest';
import { emailSchema } from './common.js';

describe('emailSchema', () => {
  it('trims and lowercases a valid email', () => {
    expect(emailSchema.parse('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
  });

  it.each(['', 'not-an-email', 'a@', '@b.com'])('rejects %j', (input) => {
    expect(emailSchema.safeParse(input).success).toBe(false);
  });

  it('rejects emails longer than 320 characters', () => {
    const long = `${'a'.repeat(310)}@example.com`;
    expect(emailSchema.safeParse(long).success).toBe(false);
  });
});
