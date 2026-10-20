import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { describeForLog } from './all-exceptions.filter.js';

describe('describeForLog', () => {
  it('drops Prisma validation details, which can echo request data', () => {
    const error = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation: { email: "ada@example.com", passwordHash: "$argon2id$secret" }',
      { clientVersion: '7.10.0' },
    );
    const line = describeForLog(error);
    expect(line).not.toContain('ada@example.com');
    expect(line).not.toContain('argon2id');
  });

  it('keeps the code of known Prisma errors and the message of ordinary errors', () => {
    const known = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    expect(describeForLog(known)).toBe('PrismaClientKnownRequestError P2002');
    expect(describeForLog(new TypeError('boom'))).toMatch(/^TypeError: boom/);
    expect(describeForLog('just a string')).toBe('Non-error value thrown');
  });
});
