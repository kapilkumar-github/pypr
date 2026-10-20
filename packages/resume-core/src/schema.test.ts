import { describe, expect, it } from 'vitest';
import { createEntry, createResumeContent, createSection } from './operations.js';
import {
  RESUME_LIMITS,
  SECTION_TYPES,
  isWebUrl,
  resumeContentSchema,
  webUrlSchema,
  yearMonthSchema,
  type ResumeContent,
} from './schema.js';

const base = () => createResumeContent({ title: 'My resume', template: 'classic' });

describe('resumeContentSchema', () => {
  it('allows each standard section once, and any number of custom sections', () => {
    const twoCustom = {
      ...base(),
      sections: [...base().sections, createSection('custom'), createSection('custom')],
    };
    expect(resumeContentSchema.safeParse(twoCustom).success).toBe(true);

    const twoExperience = {
      ...base(),
      sections: [...base().sections, createSection('experience')],
    };
    const result = resumeContentSchema.safeParse(twoExperience);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('A resume can have only one experience section');
  });

  it('accepts a new resume, and every section type with an empty entry', () => {
    const content: ResumeContent = {
      ...base(),
      sections: SECTION_TYPES.map((type) => ({
        ...createSection(type),
        entries: [createEntry(type)],
      })),
    } as ResumeContent;
    expect(resumeContentSchema.safeParse(content).success).toBe(true);
  });

  it('accepts drafts: empty strings everywhere', () => {
    expect(resumeContentSchema.safeParse({ ...base(), title: '' }).success).toBe(true);
  });

  it('rejects entry data that belongs to another section type', () => {
    const content = base();
    const experience = createSection('experience');
    const skill = createEntry('skills');
    const bad = { ...content, sections: [{ ...experience, entries: [skill] }] };
    expect(resumeContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown fields, unknown section types and bad ids', () => {
    const content = base();
    expect(resumeContentSchema.safeParse({ ...content, extra: 1 }).success).toBe(false);
    expect(
      resumeContentSchema.safeParse({
        ...content,
        sections: [{ ...createSection('skills'), type: 'hobbies' }],
      }).success,
    ).toBe(false);
    expect(
      resumeContentSchema.safeParse({
        ...content,
        sections: [{ ...createSection('skills'), id: 'x' }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate ids across sections and entries', () => {
    const section = createSection('skills');
    const entry = { ...createEntry('skills'), id: section.id };
    const result = resumeContentSchema.safeParse({
      ...base(),
      sections: [{ ...section, entries: [entry] }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Duplicate id');
  });

  it('enforces limits', () => {
    const tooMany = Array.from({ length: RESUME_LIMITS.sections + 1 }, () =>
      createSection('custom'),
    );
    expect(resumeContentSchema.safeParse({ ...base(), sections: tooMany }).success).toBe(false);

    const longName = { ...base(), basics: { ...base().basics, fullName: 'x'.repeat(121) } };
    expect(resumeContentSchema.safeParse(longName).success).toBe(false);
  });

  it('only allows slug template ids', () => {
    expect(resumeContentSchema.safeParse({ ...base(), template: 'Classic!' }).success).toBe(false);
  });
});

describe('yearMonthSchema', () => {
  it.each(['', '2024-01', '1999-12', '2024'])('accepts %j', (value) => {
    expect(yearMonthSchema.safeParse(value).success).toBe(true);
  });

  it.each(['2024-13', '2024-1', 'March 2024', '24-01', '20245'])('rejects %j', (value) => {
    expect(yearMonthSchema.safeParse(value).success).toBe(false);
  });
});

describe('web addresses', () => {
  it('accepts bare domains and http(s) links, refuses other schemes and junk', () => {
    for (const ok of [
      'ada.dev',
      'www.ada.dev/blog?x=1#top',
      'https://linkedin.com/in/ada-lovelace',
      'http://localhost.dev:8080/path',
      'https://bücher.de',
      'behance.net/ada',
    ]) {
      expect(isWebUrl(ok), ok).toBe(true);
    }
    for (const bad of [
      'javascript:alert(1)',
      'mailto:ada@example.com',
      'ftp://ada.dev',
      'ada',
      'ada dev.com',
      'https://',
      'data:text/html,hi',
    ]) {
      expect(isWebUrl(bad), bad).toBe(false);
    }
    expect(webUrlSchema.safeParse('').success).toBe(true);
    expect(webUrlSchema.safeParse('not a url').success).toBe(false);
  });
});
