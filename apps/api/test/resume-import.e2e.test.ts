import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ResumeImportResponse } from '@pypr/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ResumeParserError } from '../src/integrations/resume-parser/resume-parser.js';
import {
  ORIGIN,
  createTestApp,
  nextClientIp,
  resumeParserOf,
  signUpUser,
  testEmails,
} from './helpers.js';
import { emptyParsedResume, sampleParsedResume } from './support/parsed-resume-factory.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const { email, domain } = testEmails();
let app: NestExpressApplication;
let cookie: string;

beforeAll(async () => {
  app = await createTestApp();
  cookie = (await signUpUser(app, email('importer'))).cookie;
});

afterAll(async () => {
  await app.get(PrismaService).user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
  await app.close();
});

const upload = (buffer: Buffer, filename: string, as = cookie) =>
  request(app.getHttpServer())
    .post('/api/resume-imports')
    .set('Cookie', as)
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', nextClientIp())
    .attach('file', buffer, filename);

const resumeCount = () =>
  app.get(PrismaService).resume.count({ where: { user: { email: email('importer') } } });

describe('POST /api/resume-imports', () => {
  it('parses a PDF into resume content without saving anything', async () => {
    const parser = resumeParserOf(app);
    parser.next = sampleParsedResume();
    const before = await resumeCount();

    const res = await upload(fixture('resume.pdf'), 'Jordan CV.pdf').expect(200);
    const body = res.body as ResumeImportResponse;
    expect(body.content.basics.fullName).toBe('Jordan Example');
    expect(body.content.sections.map((s) => s.type)).toEqual([
      'experience',
      'custom',
      'education',
      'skills',
    ]);
    expect(body.warnings).toEqual([]);
    expect(parser.inputs.at(-1)?.text).toContain('Senior Engineer');
    expect(await resumeCount()).toBe(before);
  });

  it('parses a DOCX', async () => {
    const res = await upload(fixture('resume.docx'), 'cv.docx').expect(200);
    expect((res.body as ResumeImportResponse).content.basics.fullName).toBe('Jordan Example');
    expect(resumeParserOf(app).inputs.at(-1)?.text).toContain('Built the billing platform');
  });

  it('rejects other file types by content, not by name', async () => {
    const res = await upload(Buffer.from('just text'), 'cv.pdf').expect(415);
    expect(res.body).toMatchObject({ code: 'UNSUPPORTED_FILE' });
    await upload(fixture('resume.pdf'), 'cv.txt').expect(415);
  });

  it('rejects files over 5 MB', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    await upload(big, 'big.pdf').expect(413);
  });

  it('explains when a PDF has no text (a scan), without calling the parser', async () => {
    const calls = resumeParserOf(app).inputs.length;
    const res = await upload(fixture('scanned.pdf'), 'scan.pdf').expect(422);
    expect(res.body).toMatchObject({ code: 'NO_TEXT_FOUND' });
    expect((res.body as { message: string }).message).toMatch(/scan/);
    expect(resumeParserOf(app).inputs.length).toBe(calls);
  });

  it('maps parser failures to clear errors and creates nothing', async () => {
    const parser = resumeParserOf(app);
    const before = await resumeCount();
    const cases: [Error, number, string][] = [
      [new ResumeParserError('invalid_output', 'bad json'), 422, 'UNPARSEABLE_RESUME'],
      [new ResumeParserError('rate_limited', 'slow down'), 503, 'PARSER_BUSY'],
      [new ResumeParserError('timeout', 'slow'), 503, 'PARSER_BUSY'],
      [new ResumeParserError('not_configured', 'no key'), 503, 'PARSER_UNAVAILABLE'],
      [new Error('boom'), 503, 'PARSER_UNAVAILABLE'],
    ];
    for (const [error, status, code] of cases) {
      parser.next = error;
      const res = await upload(fixture('resume.pdf'), 'cv.pdf').expect(status);
      expect(res.body).toMatchObject({ code });
    }
    parser.next = emptyParsedResume();
    const empty = await upload(fixture('resume.pdf'), 'cv.pdf').expect(422);
    expect(empty.body).toMatchObject({ code: 'UNPARSEABLE_RESUME' });
    expect(await resumeCount()).toBe(before);
    parser.next = sampleParsedResume();
  });

  it('requires sign-in and an allowed Origin', async () => {
    await upload(fixture('resume.pdf'), 'cv.pdf', '').expect(401);
    await request(app.getHttpServer())
      .post('/api/resume-imports')
      .set('Cookie', cookie)
      .attach('file', fixture('resume.pdf'), 'cv.pdf')
      .expect(403);
  });

  it('round-trips: imported content can be created, then read back unchanged', async () => {
    const parsed = (await upload(fixture('resume.pdf'), 'cv.pdf').expect(200))
      .body as ResumeImportResponse;
    const created = await request(app.getHttpServer())
      .post('/api/resumes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ title: 'Jordan (imported)', content: parsed.content })
      .expect(201);
    const id = (created.body as { id: string }).id;
    const reread = await request(app.getHttpServer())
      .get(`/api/resumes/${id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect((reread.body as { content: unknown }).content).toEqual({
      ...parsed.content,
      title: 'Jordan (imported)',
    });
  });
});
