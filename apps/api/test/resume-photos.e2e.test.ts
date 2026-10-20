import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { updateBasics } from '@pypr/resume-core';
import type { ResumeDocument, ResumePhotoResponse } from '@pypr/validation';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ORIGIN, createTestApp, pdfRendererOf, signUpUser, testEmails } from './helpers.js';

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

async function newResume(cookie: string): Promise<ResumeDocument> {
  const res = await api()
    .post('/api/resumes')
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .set('Idempotency-Key', randomUUID())
    .send({ title: 'With photo' })
    .expect(201);
  return res.body as ResumeDocument;
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366ff' } })
    .png()
    .toBuffer();

const upload = (cookie: string, id: string, file: Buffer, name = 'me.png') =>
  api()
    .put(`/api/resumes/${id}/photo`)
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .attach('photo', file, name);

const fetchPhoto = (cookie: string, id: string) =>
  api()
    .get(`/api/resumes/${id}/photo`)
    .set('Cookie', cookie)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        done(null, Buffer.concat(chunks));
      });
    });

describe('resume photo', () => {
  it('uploads, reads back as a JPEG, shows on the resume, replaces and removes', async () => {
    const doc = await newResume(alice);
    expect(doc.photo).toBeNull();

    const put = await upload(alice, doc.id, await png(1200, 900)).expect(200);
    const { photo } = put.body as ResumePhotoResponse;
    expect(photo).toMatchObject({ width: 800, height: 600 });

    const got = await fetchPhoto(alice, doc.id).expect(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['cache-control']).toBe('private, no-cache');
    expect(await sharp(got.body as Buffer).metadata()).toMatchObject({
      format: 'jpeg',
      width: 800,
    });

    // The document reports it, and the content revision is untouched (no autosave conflict).
    const after = (await api().get(`/api/resumes/${doc.id}`).set('Cookie', alice).expect(200))
      .body as ResumeDocument;
    expect(after.photo).toEqual(photo);
    expect(after.revision).toBe(doc.revision);

    // An autosave of the content keeps the photo.
    const saved = (
      await api()
        .put(`/api/resumes/${doc.id}`)
        .set('Cookie', alice)
        .set('Origin', ORIGIN)
        .send({
          revision: after.revision,
          content: updateBasics(after.content, { fullName: 'Ada' }),
        })
        .expect(200)
    ).body as ResumeDocument;
    expect(saved.photo).toEqual(photo);

    const replaced = (await upload(alice, doc.id, await png(200, 300)).expect(200))
      .body as ResumePhotoResponse;
    expect(replaced.photo).toMatchObject({ width: 200, height: 300 });

    await api()
      .delete(`/api/resumes/${doc.id}/photo`)
      .set('Cookie', alice)
      .set('Origin', ORIGIN)
      .expect(204);
    await fetchPhoto(alice, doc.id).expect(404);
    // Removing again is fine (a retried request).
    await api()
      .delete(`/api/resumes/${doc.id}/photo`)
      .set('Cookie', alice)
      .set('Origin', ORIGIN)
      .expect(204);
  });

  it('refuses files that are not real images, whatever their name', async () => {
    const doc = await newResume(alice);
    const fake = await upload(alice, doc.id, Buffer.from('#!/bin/sh\necho hi\n'), 'me.jpg').expect(
      415,
    );
    expect(fake.body).toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>');
    await upload(alice, doc.id, svg, 'me.png').expect(415);
    await upload(alice, doc.id, await png(20, 20)).expect(422);
    await api()
      .put(`/api/resumes/${doc.id}/photo`)
      .set('Cookie', alice)
      .set('Origin', ORIGIN)
      .attach('photo', Buffer.alloc(5 * 1024 * 1024 + 10, 1), 'big.jpg')
      .expect(413);
    await fetchPhoto(alice, doc.id).expect(404);
  });

  it("is owner-only: another user can't read, set or remove it", async () => {
    const doc = await newResume(alice);
    await upload(alice, doc.id, await png(300, 300)).expect(200);

    await fetchPhoto(bob, doc.id).expect(404);
    await upload(bob, doc.id, await png(300, 300)).expect(404);
    await api()
      .delete(`/api/resumes/${doc.id}/photo`)
      .set('Cookie', bob)
      .set('Origin', ORIGIN)
      .expect(404);
    await fetchPhoto(alice, doc.id).expect(200);

    await api().get(`/api/resumes/${doc.id}/photo`).expect(401);
    await api()
      .put(`/api/resumes/${doc.id}/photo`)
      .set('Cookie', alice)
      .attach('photo', await png(300, 300), 'me.png')
      .expect(403); // no Origin: CSRF check
  });

  it('is embedded in the PDF as an inline image', async () => {
    const doc = await newResume(alice);
    await upload(alice, doc.id, await png(300, 300)).expect(200);
    await api().get(`/api/resumes/${doc.id}/pdf`).set('Cookie', alice).expect(200);
    const html = pdfRendererOf(app).rendered.at(-1) ?? '';
    expect(html).toMatch(/<img class="photo" src="data:image\/jpeg;base64,[A-Za-z0-9+/=]+"/);
  });

  it('is deleted with its resume', async () => {
    const doc = await newResume(alice);
    await upload(alice, doc.id, await png(300, 300)).expect(200);
    await api()
      .delete(`/api/resumes/${doc.id}`)
      .set('Cookie', alice)
      .set('Origin', ORIGIN)
      .expect(204);
    const left = await app.get(PrismaService).resumePhoto.count({ where: { resumeId: doc.id } });
    expect(left).toBe(0);
  });
});
