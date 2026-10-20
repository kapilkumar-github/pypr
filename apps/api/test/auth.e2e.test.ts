import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { hashRefreshToken } from '../src/auth/tokens.service.js';
import {
  ORIGIN,
  cookieHeader,
  createTestApp,
  outboxOf,
  setCookies,
  testEmails,
  verificationTokenFor,
} from './helpers.js';
import type { InMemoryEmailSender } from './support/in-memory-email-sender.js';

const PASSWORD = 'correct horse battery staple';
const anyUuid: unknown = expect.stringMatching(/^[0-9a-f-]{36}$/);
const { email, domain } = testEmails();

let app: NestExpressApplication;
let prisma: PrismaService;
let outbox: InMemoryEmailSender;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  outbox = outboxOf(app);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
  await app.close();
});

const http = () => request(app.getHttpServer());
let clientCounter = 0;
/** A different client IP per request (via the trusted loopback proxy), so tests don't share a rate limit. */
const post = (path: string) =>
  http()
    .post(path)
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', `198.51.100.${String((clientCounter += 1) % 250)}`);

const register = (name: string, password = PASSWORD) =>
  post('/api/auth/register').send({ email: email(name), password });
const verify = (token: string) => post('/api/auth/verify-email').send({ token });

/** Registers, opens the emailed link, and returns the session's tokens (cookie values). */
async function signUp(name: string) {
  await register(name).expect(202);
  const res = await verify(verificationTokenFor(outbox, email(name))).expect(200);
  const cookies = setCookies(res);
  return {
    res,
    accessToken: cookies.pypr_at?.value ?? '',
    refreshToken: cookies.pypr_rt?.value ?? '',
  };
}

const me = (accessToken?: string) =>
  http()
    .get('/api/auth/me')
    .set('Cookie', cookieHeader({ pypr_at: accessToken }));
const refresh = (refreshToken?: string) =>
  post('/api/auth/refresh').set('Cookie', cookieHeader({ pypr_rt: refreshToken }));

describe('POST /api/auth/register', () => {
  it('creates an unverified account and emails a link, without signing in', async () => {
    const res = await post('/api/auth/register')
      .send({ email: `  ${email('Ada').toUpperCase()} `, password: PASSWORD })
      .expect(202);

    expect(res.body).toEqual({ message: 'Check your email for a link to verify your account.' });
    expect(setCookies(res)).toEqual({});

    const user = await prisma.user.findUniqueOrThrow({ where: { email: email('ada') } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const message = outbox.lastTo(email('ada'));
    expect(message?.subject).toBe('Verify your email for Pypr');
    expect(message?.text).toMatch(/http:\/\/localhost:3000\/verify-email\?token=[\w-]{43}\n/);
    expect(message?.html).toContain('/verify-email?token=');
    expect(message?.idempotencyKey).toMatch(/^verify-email\//);
  });

  it('stores only the hash of the emailed token', async () => {
    await register('stored').expect(202);
    const token = verificationTokenFor(outbox, email('stored'));
    const record = await prisma.userToken.findFirstOrThrow({
      where: { user: { email: email('stored') } },
    });
    expect(record.tokenHash).toBe(hashRefreshToken(token));
    expect(record.purpose).toBe('verify_email');
    // expires_at comes from the app clock, created_at from the database's: allow a little drift.
    const lifetime = record.expiresAt.getTime() - record.createdAt.getTime();
    expect(Math.abs(lifetime - 24 * 60 * 60 * 1000)).toBeLessThan(5_000);
  });

  it('answers 409 EMAIL_ALREADY_REGISTERED for a taken email, verified or not, in any case', async () => {
    await signUp('taken');
    await register('pending').expect(202);
    const sentBefore = outbox.sent.length;

    for (const name of ['TAKEN', 'pending']) {
      const res = await register(name, 'a different password').expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists. Sign in instead.',
      });
    }
    expect(outbox.sent.length).toBe(sentBefore);
  });

  it('keeps no account when the email cannot be sent, so trying again works', async () => {
    outbox.failNext = true;
    await register('flaky').expect(503);
    expect(await prisma.user.count({ where: { email: email('flaky') } })).toBe(0);
    await register('flaky').expect(202);
  });

  it('rejects an invalid body without echoing the password', async () => {
    const res = await register('weak', 'hunter2').expect(400);
    expect(res.body).toMatchObject({
      message: 'Invalid request body',
      issues: [{ path: 'password' }],
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});

describe('POST /api/auth/verify-email', () => {
  it('verifies the email, signs in and sets both cookies', async () => {
    await register('verify').expect(202);
    const res = await verify(verificationTokenFor(outbox, email('verify'))).expect(200);

    expect(res.body).toEqual({ user: { id: anyUuid, email: email('verify') } });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    const { pypr_at, pypr_rt } = setCookies(res);
    expect(pypr_at?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/', 'max-age=900']),
    );
    expect(pypr_rt?.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'secure',
        'samesite=lax',
        'path=/api/auth',
        'max-age=2592000',
      ]),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email('verify') } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    await me(pypr_at?.value).expect(200);
  });

  it('works once, and voids older links for the same account', async () => {
    await register('once').expect(202);
    const older = verificationTokenFor(outbox, email('once'));
    await prisma.userToken.updateMany({
      where: { user: { email: email('once') } },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) }, // past the resend cooldown
    });
    await post('/api/auth/resend-verification')
      .send({ email: email('once') })
      .expect(202);
    const newer = verificationTokenFor(outbox, email('once'));
    expect(newer).not.toBe(older);

    await verify(newer).expect(200);
    // Opening either link again says the email is verified, without signing anyone in.
    for (const token of [newer, older]) {
      const res = await verify(token).expect(409);
      expect(res.body).toMatchObject({ code: 'EMAIL_ALREADY_VERIFIED' });
      expect(setCookies(res).pypr_at).toBeUndefined();
    }
  });

  it('verifies once when the same link is opened twice at the same moment', async () => {
    await register('twice').expect(202);
    const token = verificationTokenFor(outbox, email('twice'));
    const results = await Promise.all([verify(token), verify(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const sessions = await prisma.session.count({ where: { user: { email: email('twice') } } });
    expect(sessions).toBe(1);
  });

  it('rejects expired and unknown tokens', async () => {
    await register('stale').expect(202);
    const token = verificationTokenFor(outbox, email('stale'));
    await prisma.userToken.updateMany({
      where: { user: { email: email('stale') } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await verify(token).expect(400)).body).toMatchObject({
      code: 'VERIFICATION_LINK_EXPIRED',
    });
    expect((await verify('x'.repeat(43)).expect(400)).body).toMatchObject({
      code: 'INVALID_TOKEN',
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email: email('stale') } })).emailVerifiedAt,
    ).toBeNull();
  });
});

describe('POST /api/auth/resend-verification', () => {
  const resend = (name: string) =>
    post('/api/auth/resend-verification')
      .send({ email: email(name) })
      .expect(202);

  it('sends a new link to an unverified account, at most once a minute', async () => {
    await register('resend').expect(202);
    await prisma.userToken.updateMany({
      where: { user: { email: email('resend') } },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    });

    await resend('resend');
    expect(outbox.countTo(email('resend'))).toBe(2);
    await resend('resend'); // within the cooldown: ignored
    expect(outbox.countTo(email('resend'))).toBe(2);
  });

  it('gives the same answer, and sends nothing, for unknown or verified accounts', async () => {
    await signUp('done');
    const sentBefore = outbox.sent.length;
    const unknown = await resend('nobody');
    const verified = await resend('done');
    expect(unknown.body).toEqual(verified.body);
    expect(outbox.sent.length).toBe(sentBefore);
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await signUp('login');
  });

  it('signs in with the right password', async () => {
    const res = await post('/api/auth/login')
      .set('User-Agent', 'vitest-browser')
      .send({ email: email('LOGIN'), password: PASSWORD })
      .expect(200);
    expect(res.body).toEqual({ user: { id: anyUuid, email: email('login') } });

    const accessToken = setCookies(res).pypr_at?.value;
    const session = await prisma.session.findFirstOrThrow({
      where: { user: { email: email('login') }, userAgent: 'vitest-browser' },
    });
    expect(session.revokedAt).toBeNull();
    await me(accessToken).expect(200);
  });

  it('refuses an unverified account with EMAIL_NOT_VERIFIED, but only after the password', async () => {
    await register('unverified').expect(202);
    const res = await post('/api/auth/login')
      .send({ email: email('unverified'), password: PASSWORD })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(setCookies(res)).toEqual({});

    const wrong = await post('/api/auth/login')
      .send({ email: email('unverified'), password: 'not the password' })
      .expect(401);
    expect(wrong.body).not.toHaveProperty('code');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await post('/api/auth/login')
      .send({ email: email('login'), password: 'not the password' })
      .expect(401);
    const unknown = await post('/api/auth/login')
      .send({ email: email('nobody'), password: PASSWORD })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body).toMatchObject({ message: 'Invalid email or password.' });
    expect(setCookies(wrong)).toEqual({});
  });
});

describe('GET /api/auth/me (guarded)', () => {
  it('returns the signed-in user', async () => {
    const { accessToken } = await signUp('me');
    const res = await me(accessToken).expect(200);
    expect(res.body).toEqual({ user: { id: anyUuid, email: email('me') } });
  });

  it('rejects a missing or malformed access token', async () => {
    await me().expect(401);
    await me('garbage').expect(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates both tokens and keeps the session', async () => {
    const first = await signUp('rotate');
    const res = await refresh(first.refreshToken).expect(200);
    const next = setCookies(res);

    expect(res.body).toEqual({ user: { id: anyUuid, email: email('rotate') } });
    expect(next.pypr_rt?.value).toBeTruthy();
    expect(next.pypr_rt?.value).not.toBe(first.refreshToken);
    await me(next.pypr_at?.value).expect(200);
  });

  it('revokes the whole session when a used refresh token comes back', async () => {
    const first = await signUp('reuse');
    const second = setCookies(await refresh(first.refreshToken).expect(200));

    // The old token is presented again: treat it as stolen.
    const reuse = await refresh(first.refreshToken).expect(401);
    expect(setCookies(reuse).pypr_rt?.value).toBe('');

    // Every token of that session is now dead, including the newest ones.
    await refresh(second.pypr_rt?.value).expect(401);
    await me(second.pypr_at?.value).expect(401);
    await me(first.accessToken).expect(401);
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const { refreshToken } = await signUp('race');
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('rejects expired, unknown and missing tokens', async () => {
    const { refreshToken } = await signUp('expired');
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await refresh(refreshToken).expect(401);
    await refresh('unknown-token').expect(401);
    await refresh().expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears both cookies', async () => {
    const { accessToken, refreshToken } = await signUp('logout');
    const res = await post('/api/auth/logout')
      .set('Cookie', cookieHeader({ pypr_at: accessToken, pypr_rt: refreshToken }))
      .expect(204);

    const cleared = setCookies(res);
    expect(cleared.pypr_at?.value).toBe('');
    expect(cleared.pypr_rt?.attributes).toContain('path=/api/auth');
    await me(accessToken).expect(401);
    await refresh(refreshToken).expect(401);
  });

  it('works with only the access token', async () => {
    const { accessToken, refreshToken } = await signUp('logout-at');
    await post('/api/auth/logout')
      .set('Cookie', cookieHeader({ pypr_at: accessToken }))
      .expect(204);
    await refresh(refreshToken).expect(401);
  });

  it('succeeds without any session', async () => {
    await post('/api/auth/logout').expect(204);
  });
});

describe('Origin check', () => {
  it.each([
    ['missing', undefined],
    ['foreign', 'https://evil.example'],
  ])('rejects a data-changing request with a %s Origin', async (_, origin) => {
    const req = http().post('/api/auth/login');
    if (origin) req.set('Origin', origin);
    const res = await req.send({ email: email('login'), password: PASSWORD }).expect(403);
    expect(res.body).toMatchObject({ message: 'Origin not allowed' });
  });

  it('does not apply to reads', async () => {
    await http().get('/api/health').expect(200);
  });
});

describe('rate limits', () => {
  let limited: NestExpressApplication;

  beforeAll(async () => {
    limited = await createTestApp(); // fresh in-memory counters
  });

  afterAll(async () => {
    await limited.close();
  });

  it('allows 10 login attempts per minute per IP, then answers 429', async () => {
    const attempt = (ip: string) =>
      request(limited.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ email: email('nobody'), password: 'wrong password' });

    for (let i = 0; i < 10; i += 1) await attempt('203.0.113.7').expect(401);
    const blocked = await attempt('203.0.113.7').expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // Another client is not affected.
    await attempt('203.0.113.8').expect(401);
  });

  it('does not rate-limit GET /api/auth/me, which every page load calls', async () => {
    for (let i = 0; i < 15; i += 1) {
      await request(limited.getHttpServer())
        .get('/api/auth/me')
        .set('X-Forwarded-For', '203.0.113.9')
        .expect(401);
    }
  });
});
