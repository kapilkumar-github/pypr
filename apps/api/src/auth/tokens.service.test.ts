import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import { TokensService, hashRefreshToken } from './tokens.service.js';

const SECRET = 'unit-test-secret-0123456789abcdef0123456789';
const service = (secret = SECRET) =>
  new TokensService(new ConfigService<Env, true>({ JWT_ACCESS_SECRET: secret }));
const claims = { userId: randomUUID(), sessionId: randomUUID() };

function forge(overrides: { exp?: number; iss?: string; aud?: string; alg?: 'HS256' | 'HS512' }) {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: overrides.alg ?? 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(overrides.iss ?? JWT_ISSUER)
    .setAudience(overrides.aud ?? JWT_AUDIENCE)
    .setExpirationTime(overrides.exp ?? '15m')
    .sign(new TextEncoder().encode(SECRET));
}

describe('TokensService access tokens', () => {
  it('round-trips user and session ids', async () => {
    const tokens = service();
    expect(await tokens.verifyAccessToken(await tokens.signAccessToken(claims))).toEqual(claims);
  });

  it('expires after 15 minutes', async () => {
    const token = await service().signAccessToken(claims);
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      iat: number;
      exp: number;
    };
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it('rejects tokens signed with another key', async () => {
    const token = await service('another-secret-0123456789abcdef0123456789').signAccessToken(
      claims,
    );
    expect(await service().verifyAccessToken(token)).toBeNull();
  });

  it('rejects tampered, expired, wrong-issuer, wrong-audience and wrong-algorithm tokens', async () => {
    const tokens = service();
    const good = await tokens.signAccessToken(claims);
    const [header, , signature] = good.split('.');
    const otherBody = Buffer.from(
      JSON.stringify({ sub: randomUUID(), sid: claims.sessionId }),
    ).toString('base64url');

    for (const token of [
      `${header ?? ''}.${otherBody}.${signature ?? ''}`,
      await forge({ exp: Math.floor(Date.now() / 1000) - 10 }),
      await forge({ iss: 'someone-else' }),
      await forge({ aud: 'someone-else' }),
      await forge({ alg: 'HS512' }),
      'not.a.jwt',
    ]) {
      expect(await tokens.verifyAccessToken(token)).toBeNull();
    }
  });
});

describe('TokensService refresh tokens', () => {
  it('creates 256-bit random tokens and returns their SHA-256 hash', () => {
    const { token, hash } = service().createRefreshToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken(token));
    expect(service().createRefreshToken().token).not.toBe(token);
  });
});
