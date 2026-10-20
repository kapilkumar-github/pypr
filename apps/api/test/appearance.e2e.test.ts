import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Appearance, ResumeDocument } from '@pypr/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ORIGIN, createTestApp, signUpUser, testEmails } from './helpers.js';

const { email, domain } = testEmails();
let app: NestExpressApplication;
let alice: string;
let bob: string;

beforeAll(async () => {
  app = await createTestApp();
  alice = (await signUpUser(app, email('alice'))).cookie;
  bob = (await signUpUser(app, email('bob'))).cookie;
});

afterAll(async () => {
  await app.get(PrismaService).user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
  await app.close();
});

const api = () => request(app.getHttpServer());
const get = (cookie: string) => api().get('/api/me/appearance').set('Cookie', cookie);
const patch = (cookie: string, body: object) =>
  api().patch('/api/me/appearance').set('Cookie', cookie).set('Origin', ORIGIN).send(body);

describe('/api/me/appearance', () => {
  it('starts unset, so the browser or the defaults apply', async () => {
    expect((await get(alice).expect(200)).body).toEqual({ theme: null, accentColor: null });
  });

  it('changes only the given field and keeps the other', async () => {
    await patch(alice, { theme: 'light' }).expect(200);
    const res = await patch(alice, { accentColor: '#a78bfa' }).expect(200);
    expect(res.body).toEqual({ theme: 'light', accentColor: '#A78BFA' });
    await patch(alice, { theme: 'dark' }).expect(200);
    expect((await get(alice).expect(200)).body as Appearance).toEqual({
      theme: 'dark',
      accentColor: '#A78BFA',
    });
    // Per account: Bob is untouched.
    expect((await get(bob).expect(200)).body).toEqual({ theme: null, accentColor: null });
  });

  it("never changes a resume's own accent, and a resume's accent never changes it", async () => {
    const created = await api()
      .post('/api/resumes')
      .set('Cookie', bob)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'Mine' })
      .expect(201);
    const doc = created.body as ResumeDocument;

    await patch(bob, { accentColor: '#22D3EE' }).expect(200);
    const resume = (await api().get(`/api/resumes/${doc.id}`).set('Cookie', bob).expect(200))
      .body as ResumeDocument;
    expect(resume.content.settings.accentColor).toBe('#B7FF3C');

    await api()
      .put(`/api/resumes/${doc.id}`)
      .set('Cookie', bob)
      .set('Origin', ORIGIN)
      .send({
        revision: resume.revision,
        content: {
          ...resume.content,
          settings: { ...resume.content.settings, accentColor: '#FF7A6B' },
        },
      })
      .expect(200);
    expect(((await get(bob).expect(200)).body as Appearance).accentColor).toBe('#22D3EE');
  });

  it('validates the body and requires sign-in and an allowed origin', async () => {
    await patch(alice, {}).expect(400);
    await patch(alice, { theme: 'sepia' }).expect(400);
    await patch(alice, { accentColor: 'lime' }).expect(400);
    await patch(alice, { theme: 'dark', density: 'compact' }).expect(400);
    await api().get('/api/me/appearance').expect(401);
    await api()
      .patch('/api/me/appearance')
      .set('Cookie', alice)
      .send({ theme: 'dark' })
      .expect(403);
  });
});
