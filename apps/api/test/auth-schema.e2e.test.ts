import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

// Checks the auth tables from the first migration against the real test database.

const run = randomUUID().slice(0, 8);
const email = (name: string) => `${name}-${run}@schema-test.pypr.dev`;
const tokenHash = () => createHash('sha256').update(randomBytes(32)).digest('hex');
const inThirtyDays = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

describe('auth schema', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Cascades to sessions, refresh tokens and identity providers.
    await prisma.user.deleteMany({
      where: { email: { endsWith: `-${run}@schema-test.pypr.dev` } },
    });
    await prisma.$disconnect();
  });

  it('stores a user with a session and a refresh token, using UUIDv7 ids', async () => {
    const user = await prisma.user.create({
      data: {
        email: email('alice'),
        passwordHash: '$argon2id$placeholder',
        sessions: {
          create: {
            refreshTokens: { create: { tokenHash: tokenHash(), expiresAt: inThirtyDays() } },
          },
        },
      },
      include: { sessions: { include: { refreshTokens: true } } },
    });

    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0]?.revokedAt).toBeNull();
    expect(user.sessions[0]?.refreshTokens[0]?.usedAt).toBeNull();
  });

  it('rejects a second account with the same email', async () => {
    await prisma.user.create({ data: { email: email('dup') } });
    await expect(prisma.user.create({ data: { email: email('dup') } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects emails that are not lowercased', async () => {
    await expect(prisma.user.create({ data: { email: email('Bob') } })).rejects.toThrow(
      /ck_users_email_lowercase/,
    );
  });

  it('rejects refresh token hashes that are not hex SHA-256', async () => {
    const user = await prisma.user.create({
      data: { email: email('carol'), sessions: { create: {} } },
      include: { sessions: true },
    });
    const sessionId = user.sessions[0]?.id ?? '';
    await expect(
      prisma.refreshToken.create({
        data: { sessionId, tokenHash: 'x'.repeat(64), expiresAt: inThirtyDays() },
      }),
    ).rejects.toThrow(/ck_refresh_tokens_token_hash_hex/);
  });

  it('links one provider account to one user only', async () => {
    const providerUserId = `li-${run}`;
    await prisma.user.create({
      data: {
        email: email('dan'),
        identityProviders: { create: { provider: 'linkedin', providerUserId } },
      },
    });
    await expect(
      prisma.user.create({
        data: {
          email: email('erin'),
          identityProviders: { create: { provider: 'linkedin', providerUserId } },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('deletes sessions and refresh tokens with the user', async () => {
    const user = await prisma.user.create({
      data: {
        email: email('frank'),
        sessions: {
          create: {
            refreshTokens: { create: { tokenHash: tokenHash(), expiresAt: inThirtyDays() } },
          },
        },
      },
      include: { sessions: true },
    });
    const sessionId = user.sessions[0]?.id ?? '';

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.count({ where: { id: sessionId } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { sessionId } })).toBe(0);
  });
});
