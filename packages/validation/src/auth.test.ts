import { describe, expect, it } from 'vitest';
import { loginRequestSchema, registerRequestSchema, verifyEmailRequestSchema } from './auth.js';

describe('registerRequestSchema', () => {
  it('normalizes the email and keeps the password as typed', () => {
    expect(
      registerRequestSchema.parse({ email: ' Ada@Example.com ', password: ' correct horse ' }),
    ).toEqual({ email: 'ada@example.com', password: ' correct horse ' });
  });

  it.each([
    { email: 'ada@example.com', password: 'short' },
    { email: 'ada@example.com', password: 'x'.repeat(129) },
    { email: 'nope', password: 'long enough password' },
    { email: 'ada@example.com' },
  ])('rejects %j', (input) => {
    expect(registerRequestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const input = { email: 'ada@example.com', password: 'long enough password', admin: true };
    expect(registerRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('accepts short passwords (policy applies only when choosing one)', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('verifyEmailRequestSchema', () => {
  it('accepts a token and rejects empty, short or oversized ones', () => {
    expect(verifyEmailRequestSchema.safeParse({ token: 'a'.repeat(43) }).success).toBe(true);
    for (const token of ['', 'short', 'a'.repeat(129)]) {
      expect(verifyEmailRequestSchema.safeParse({ token }).success).toBe(false);
    }
  });
});
