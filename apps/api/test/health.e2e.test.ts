import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './helpers.js';

describe('GET /api/health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok when the database answers, without signing in', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('answers oversized and malformed bodies with JSON errors, not stack traces', async () => {
    const big = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send(`{"email":"${'a'.repeat(1_100_000)}"}`);
    expect(big.status).toBe(413);
    expect(big.text).not.toMatch(/\bat \//);

    const malformed = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(malformed.status).toBe(400);
    expect(malformed.text).not.toMatch(/\bat \//);
  });

  it('only serves routes under the /api prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});

describe('GET /api/health when the database is down', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(PrismaService).useValue({
        $queryRaw: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
        $disconnect: () => Promise.resolve(),
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 without leaking the error', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(503);
    expect(res.body).toEqual({ status: 'error', database: 'unreachable' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});
