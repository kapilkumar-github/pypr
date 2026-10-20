import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  addEntry,
  addSection,
  createSection,
  moveEntry,
  moveSection,
  removeSection,
  updateBasics,
  updateEntryData,
  type ResumeContent,
} from '@pypr/resume-core';
import type { ResumeDocument } from '@pypr/validation';
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
const asUser = (cookie: string) => ({
  list: () => api().get('/api/resumes').set('Cookie', cookie),
  create: (body: object, key: string | null = randomUUID()) => {
    const req = api().post('/api/resumes').set('Cookie', cookie).set('Origin', ORIGIN);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  },
  get: (id: string) => api().get(`/api/resumes/${id}`).set('Cookie', cookie),
  save: (id: string, body: object) =>
    api().put(`/api/resumes/${id}`).set('Cookie', cookie).set('Origin', ORIGIN).send(body),
  delete: (id: string) =>
    api().delete(`/api/resumes/${id}`).set('Cookie', cookie).set('Origin', ORIGIN),
});

async function newResume(cookie: string, title = 'My resume'): Promise<ResumeDocument> {
  return (await asUser(cookie).create({ title }).expect(201)).body as ResumeDocument;
}

function save(cookie: string, doc: ResumeDocument, content: ResumeContent) {
  return asUser(cookie).save(doc.id, { revision: doc.revision, content });
}

describe('POST /api/resumes', () => {
  it('creates a resume with the starter sections at revision 1', async () => {
    const res = await asUser(alice).create({ title: '  Engineering CV ' }).expect(201);
    const doc = res.body as ResumeDocument;
    expect(doc).toMatchObject({ revision: 1, schemaVersion: 2 });
    expect(doc.content.title).toBe('Engineering CV');
    expect(doc.content.template).toBe('classic');
    expect(doc.content.sections.map((s) => s.type)).toEqual(['experience', 'education', 'skills']);
  });

  it('returns the same resume when retried with the same Idempotency-Key', async () => {
    const key = randomUUID();
    const first = (await asUser(alice).create({ title: 'Retry me' }, key).expect(201))
      .body as ResumeDocument;
    const again = (await asUser(alice).create({ title: 'Retry me' }, key).expect(200))
      .body as ResumeDocument;
    expect(again.id).toBe(first.id);

    // The key is per user: someone else using it gets their own resume.
    const other = (await asUser(bob).create({ title: 'Retry me' }, key).expect(201))
      .body as ResumeDocument;
    expect(other.id).not.toBe(first.id);
  });

  it('creates once when the same key is sent twice at the same moment', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      asUser(alice).create({ title: 'Race' }, key),
      asUser(alice).create({ title: 'Race' }, key),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((results[0].body as ResumeDocument).id).toBe((results[1].body as ResumeDocument).id);
  });

  it('creates a resume from given content (a confirmed import), with its entries', async () => {
    const base = (await asUser(alice).create({ title: 'tmp' }).expect(201)).body as ResumeDocument;
    let content = updateBasics(base.content, { fullName: 'Imported Person' });
    content = addEntry(content, content.sections[0]?.id ?? '');
    content = addSection(content, 'custom');
    // Fresh ids: the temporary resume above already uses these.
    const fresh = JSON.parse(
      JSON.stringify(content).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        () => randomUUID(),
      ),
    ) as ResumeContent;

    const created = (
      await asUser(alice).create({ title: 'From import', content: fresh }).expect(201)
    ).body as ResumeDocument;
    expect(created.content).toEqual({ ...fresh, title: 'From import' });
    const reread = (await asUser(alice).get(created.id).expect(200)).body as ResumeDocument;
    expect(reread.content).toEqual(created.content);

    // Reusing ids that belong to another resume is refused.
    await asUser(alice).create({ title: 'Clash', content }).expect(400);
    // Content breaking the domain rules is refused.
    const twoSkills = { ...fresh, sections: [...fresh.sections, createSection('skills')] };
    await asUser(alice).create({ title: 'Bad', content: twoSkills }).expect(400);
  });

  it('requires a UUID Idempotency-Key, a title and a known template', async () => {
    await asUser(alice).create({ title: 'x' }, null).expect(400);
    await asUser(alice).create({ title: 'x' }, 'not-a-uuid').expect(400);
    await asUser(alice).create({ title: '' }).expect(400);
    await asUser(alice).create({ title: 'x', template: 'fancy' }).expect(400);
  });
});

describe('GET /api/resumes', () => {
  it("lists only the user's own resumes, most recently edited first", async () => {
    const carol = (await signUpUser(app, email('carol'))).cookie;
    const older = await newResume(carol, 'Older');
    const newer = await newResume(carol, 'Newer');
    await save(carol, older, { ...older.content, title: 'Older, edited' }).expect(200);

    const res = await asUser(carol).list().expect(200);
    const { resumes } = res.body as {
      resumes: { id: string; title: string; headline: string; createdAt: string }[];
    };
    expect(resumes[0]).toMatchObject({ headline: '', createdAt: expect.any(String) as unknown });
    expect(resumes.map((r) => r.title)).toEqual(['Older, edited', 'Newer']);
    expect(resumes.map((r) => r.id)).toEqual([older.id, newer.id]);
  });
});

describe('PUT /api/resumes/:id', () => {
  it('saves the whole content, bumps the revision, and reads back the same', async () => {
    const doc = await newResume(alice);
    const [experience] = doc.content.sections;
    let content = updateBasics(doc.content, { fullName: 'Alice Example', headline: 'Engineer' });
    content = addEntry(content, experience?.id ?? '');
    const entryId = content.sections[0]?.entries[0]?.id ?? '';
    content = updateEntryData<'experience'>(content, experience?.id ?? '', entryId, {
      position: 'Staff Engineer',
      company: 'Acme',
      startDate: '2021-04',
      current: true,
      highlights: ['Led the platform team'],
    });
    content = addSection(content, 'languages');

    const saved = (await save(alice, doc, content).expect(200)).body as ResumeDocument;
    expect(saved.revision).toBe(2);
    expect(saved.content).toEqual(content);
    expect(((await asUser(alice).get(doc.id).expect(200)).body as ResumeDocument).content).toEqual(
      content,
    );
  });

  it('reorders, moves entries between sections, and deletes', async () => {
    const doc = await newResume(alice);
    const [a, b, c] = doc.content.sections.map((s) => s.id) as [string, string, string];
    let content = addEntry(addEntry(doc.content, a), a);
    const [e1, e2] = content.sections[0]?.entries.map((e) => e.id) as [string, string];
    let current = (await save(alice, doc, content).expect(200)).body as ResumeDocument;

    content = moveEntry(content, a, e2, 0);
    content = moveSection(content, c, 0);
    current = (await save(alice, current, content).expect(200)).body as ResumeDocument;
    expect(current.content.sections.map((s) => s.id)).toEqual([c, a, b]);
    expect(current.content.sections[1]?.entries.map((e) => e.id)).toEqual([e2, e1]);

    // Section a gets deleted below; e1 survives only if it moved out first. Entries can move
    // only between sections of the same type, so use two custom sections for that part.
    content = removeSection(content, a);
    current = (await save(alice, current, content).expect(200)).body as ResumeDocument;
    expect(current.content.sections.map((s) => s.id)).toEqual([c, b]);
    const remaining: string[] = [];
    for (const section of current.content.sections) {
      for (const entry of section.entries) remaining.push(entry.id);
    }
    expect(remaining).not.toContain(e1);

    content = addSection(addSection(content, 'custom'), 'custom');
    const [x, y] = content.sections.filter((s) => s.type === 'custom').map((s) => s.id) as [
      string,
      string,
    ];
    content = addEntry(content, x);
    const moving = content.sections.find((s) => s.id === x)?.entries[0];
    current = (await save(alice, current, content).expect(200)).body as ResumeDocument;
    const moved = structuredClone(content) as unknown as {
      sections: { id: string; entries: { id: string }[] }[];
    };
    for (const section of moved.sections) {
      if (section.id === x) section.entries = [];
      if (section.id === y && moving) section.entries = [moving];
    }
    current = (await save(alice, current, moved as unknown as ResumeContent).expect(200))
      .body as ResumeDocument;
    expect(current.content.sections.find((s) => s.id === y)?.entries.map((e) => e.id)).toEqual([
      moving?.id,
    ]);
    expect(current.content.sections.find((s) => s.id === x)?.entries).toEqual([]);

    const prisma = app.get(PrismaService);
    expect(await prisma.resumeEntry.count({ where: { id: e2 } })).toBe(0);
  });

  it('answers 409 REVISION_CONFLICT for a stale revision and keeps the newer save', async () => {
    const doc = await newResume(alice);
    await save(alice, doc, { ...doc.content, title: 'From tab one' }).expect(200);
    const res = await save(alice, doc, { ...doc.content, title: 'From tab two' }).expect(409);
    expect(res.body).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
    const current = (await asUser(alice).get(doc.id).expect(200)).body as ResumeDocument;
    expect(current.content.title).toBe('From tab one');
  });

  it('lets only one of two concurrent saves of the same revision win', async () => {
    const doc = await newResume(alice);
    const results = await Promise.all([
      save(alice, doc, { ...doc.content, title: 'A' }),
      save(alice, doc, { ...doc.content, title: 'B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('rejects a second section of a standard type, but allows several custom ones', async () => {
    const doc = await newResume(alice);
    const res = await save(alice, doc, addSection(doc.content, 'custom')).expect(200);
    const withCustom = (res.body as ResumeDocument).content;
    await save(alice, res.body as ResumeDocument, addSection(withCustom, 'custom')).expect(200);

    const duplicate = {
      ...doc.content,
      sections: [...doc.content.sections, { ...createSection('experience') }],
    };
    const rejected = await asUser(alice)
      .save(doc.id, { revision: 3, content: duplicate })
      .expect(400);
    expect(JSON.stringify(rejected.body)).toContain('only one experience section');
  });

  it('rejects invalid content and unknown templates', async () => {
    const doc = await newResume(alice);
    await asUser(alice)
      .save(doc.id, { revision: 1, content: { ...doc.content, sections: 'x' } })
      .expect(400);
    await save(alice, doc, { ...doc.content, template: 'fancy' }).expect(400);
    await asUser(alice).save(doc.id, { content: doc.content }).expect(400);
  });

  it('accepts a large resume (over the default 100 kB body limit)', async () => {
    const doc = await newResume(alice);
    const experience = doc.content.sections[0]?.id ?? '';
    let content = doc.content;
    for (let i = 0; i < 40; i += 1) content = addEntry(content, experience);
    for (const entry of content.sections[0]?.entries ?? []) {
      content = updateEntryData<'experience'>(content, experience, entry.id, {
        summary: 'x'.repeat(2000),
      });
    }
    expect(JSON.stringify(content).length).toBeGreaterThan(80_000);
    await save(alice, doc, content).expect(200);
  });
});

describe('presentation settings', () => {
  it('start as neon lime, Helvetica and normal density', async () => {
    const doc = await newResume(alice);
    expect(doc.content.settings).toEqual({
      accentColor: '#B7FF3C',
      font: 'helvetica',
      density: 'normal',
    });
  });

  it('persist per resume, normalized to uppercase hex', async () => {
    const doc = await newResume(alice);
    const other = await newResume(alice);
    const saved = (
      await save(alice, doc, {
        ...doc.content,
        settings: { accentColor: '#22d3ee', font: 'georgia', density: 'spaced' },
      }).expect(200)
    ).body as ResumeDocument;
    expect(saved.content.settings).toEqual({
      accentColor: '#22D3EE',
      font: 'georgia',
      density: 'spaced',
    });
    const reread = (await asUser(alice).get(doc.id).expect(200)).body as ResumeDocument;
    expect(reread.content.settings).toEqual(saved.content.settings);
    // Another resume keeps its own settings.
    const untouched = (await asUser(alice).get(other.id).expect(200)).body as ResumeDocument;
    expect(untouched.content.settings.accentColor).toBe('#B7FF3C');
  });

  it.each([
    { accentColor: 'lime', font: 'helvetica', density: 'normal' },
    { accentColor: '#B7FF3', font: 'helvetica', density: 'normal' },
    { accentColor: '#B7FF3C', font: 'comic-sans', density: 'normal' },
    { accentColor: '#B7FF3C', font: 'helvetica', density: 'airy' },
  ])('rejects invalid settings %j', async (settings) => {
    const doc = await newResume(alice);
    await save(alice, doc, { ...doc.content, settings } as unknown as ResumeContent).expect(400);
  });

  it('fills in defaults when content arrives without settings (older clients)', async () => {
    const doc = await newResume(alice);
    const { settings: _, ...withoutSettings } = doc.content;
    const res = await asUser(alice)
      .save(doc.id, { revision: doc.revision, content: withoutSettings })
      .expect(200);
    expect((res.body as ResumeDocument).content.settings.font).toBe('helvetica');
  });

  it('reads resumes stored before settings existed with the defaults', async () => {
    const doc = await newResume(alice);
    // Columns got their defaults in the migration; simulate an unknown font from the future.
    await app
      .get(PrismaService)
      .resume.update({ where: { id: doc.id }, data: { font: 'retired-font' } });
    const reread = (await asUser(alice).get(doc.id).expect(200)).body as ResumeDocument;
    expect(reread.content.settings.font).toBe('helvetica');
  });
});

describe('ownership', () => {
  let aliceResume: ResumeDocument;

  beforeAll(async () => {
    aliceResume = await newResume(alice, "Alice's");
    aliceResume = (
      await save(
        alice,
        aliceResume,
        addEntry(aliceResume.content, aliceResume.content.sections[0]?.id ?? ''),
      ).expect(200)
    ).body as ResumeDocument;
  });

  it("hides another user's resume: 404 for get, save and delete", async () => {
    await asUser(bob).get(aliceResume.id).expect(404);
    await save(bob, aliceResume, { ...aliceResume.content, title: 'Mine now' }).expect(404);
    await asUser(bob).delete(aliceResume.id).expect(404);
    const list = (await asUser(bob).list().expect(200)).body as { resumes: { id: string }[] };
    expect(list.resumes.map((r) => r.id)).not.toContain(aliceResume.id);
  });

  it("can't take over another resume's sections or entries by reusing their ids", async () => {
    const bobs = await newResume(bob, "Bob's");
    const stolenSection = aliceResume.content.sections[0];
    if (!stolenSection) throw new Error('missing section');
    const stolen = { ...stolenSection, title: 'Hijacked' };
    await save(bob, bobs, { ...bobs.content, sections: [stolen] }).expect(400);

    const after = (await asUser(alice).get(aliceResume.id).expect(200)).body as ResumeDocument;
    expect(after.content).toEqual(aliceResume.content);
    const bobsAfter = (await asUser(bob).get(bobs.id).expect(200)).body as ResumeDocument;
    expect(bobsAfter.revision).toBe(1); // the failed save rolled back entirely
  });

  it('answers 404 for unknown ids and 400 for malformed ones', async () => {
    await asUser(alice).get(randomUUID()).expect(404);
    await asUser(alice).get('not-a-uuid').expect(400);
  });

  it('requires sign-in', async () => {
    await api().get('/api/resumes').expect(401);
    await api().get(`/api/resumes/${aliceResume.id}`).expect(401);
  });
});

describe('DELETE /api/resumes/:id', () => {
  it('deletes the resume and all its content', async () => {
    const doc = await newResume(alice);
    await asUser(alice).delete(doc.id).expect(204);
    await asUser(alice).get(doc.id).expect(404);
    await asUser(alice).delete(doc.id).expect(404);
    expect(await app.get(PrismaService).resumeSection.count({ where: { resumeId: doc.id } })).toBe(
      0,
    );
  });
});

describe('GET /api/resumes/:id/pdf', () => {
  it('renders the saved resume with its template and sends it as a download', async () => {
    const doc = await newResume(alice, 'For PDF');
    await save(alice, doc, updateBasics(doc.content, { fullName: 'Alice Example' })).expect(200);

    const res = await api()
      .get(`/api/resumes/${doc.id}/pdf`)
      .set('Cookie', alice)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="Alice Example - Resume.pdf"; filename*=UTF-8''Alice%20Example%20-%20Resume.pdf`,
    );
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const html = pdfRendererOf(app).rendered.at(-1) ?? '';
    expect(html).toContain('Alice Example');
    expect(html).toContain('size: A4');
  });

  it("renders with the resume's accent, font and density", async () => {
    const doc = await newResume(alice);
    await save(alice, doc, {
      ...doc.content,
      settings: { accentColor: '#A78BFA', font: 'palatino', density: 'compact' },
    }).expect(200);
    await api().get(`/api/resumes/${doc.id}/pdf`).set('Cookie', alice).expect(200);
    const html = pdfRendererOf(app).rendered.at(-1) ?? '';
    expect(html).toContain('--resume-accent: #A78BFA');
    expect(html).toContain('--resume-font: "Palatino Linotype"');
    expect(html).toContain('--resume-line-height: 1.3');
  });

  it('supports Letter and rejects other page sizes', async () => {
    const doc = await newResume(alice);
    await api().get(`/api/resumes/${doc.id}/pdf?pageSize=Letter`).set('Cookie', alice).expect(200);
    expect(pdfRendererOf(app).rendered.at(-1)).toContain('size: Letter');
    await api().get(`/api/resumes/${doc.id}/pdf?pageSize=A3`).set('Cookie', alice).expect(400);
  });

  it('is owner-only and answers 503 when rendering fails', async () => {
    const doc = await newResume(alice);
    await api().get(`/api/resumes/${doc.id}/pdf`).set('Cookie', bob).expect(404);
    await api().get(`/api/resumes/${doc.id}/pdf`).expect(401);
    pdfRendererOf(app).failNext = true;
    await api().get(`/api/resumes/${doc.id}/pdf`).set('Cookie', alice).expect(503);
  });
});

describe('OpenAPI docs', () => {
  it('serves the spec with the resume and auth routes', async () => {
    const res = await api().get('/api/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);
    expect(paths).toEqual(
      expect.arrayContaining(['/api/resumes', '/api/resumes/{id}', '/api/auth/login']),
    );
  });
});
