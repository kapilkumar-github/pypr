import { describe, expect, it } from 'vitest';
import { emptyParsedResume, sampleParsedResume } from '../../test/support/parsed-resume-factory.js';
import { EmptyImportError, normalizeDate, toResumeContent } from './normalize.js';

const options = { title: 'Imported resume', template: 'classic' };

describe('normalizeDate', () => {
  it.each([
    ['2021-03', '2021-03'],
    ['2021-3', '2021-03'],
    ['2021-03-15', '2021-03'],
    ['03/2021', '2021-03'],
    ['Mar 2021', '2021-03'],
    ['September 2019', '2019-09'],
    ['2018', '2018'],
    [null, ''],
    ['Summer 2020', ''],
    ['2021-13', '2021'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });
});

describe('toResumeContent', () => {
  it('maps parser output onto the domain model in document order', () => {
    const { content } = toResumeContent(sampleParsedResume(), options);
    expect(content.basics).toMatchObject({
      fullName: 'Jordan Example',
      email: 'jordan@example.com',
      phone: '',
    });
    expect(content.sections.map((s) => [s.type, s.title])).toEqual([
      ['experience', 'Work History'],
      ['custom', 'Volunteering'],
      ['education', 'Education'],
      ['skills', 'Skills'],
    ]);
  });

  it('turns "Present" into an ongoing role and drops empty bullets', () => {
    const { content } = toResumeContent(sampleParsedResume(), options);
    expect(content.sections[0]?.entries[0]?.data).toMatchObject({
      startDate: '2021-03',
      endDate: '',
      current: true,
      highlights: ['Built the billing platform', 'Led a team of four'],
    });
  });

  it('keeps year-only dates without inventing a month', () => {
    const { content } = toResumeContent(sampleParsedResume(), options);
    expect(content.sections[2]?.entries[0]?.data).toMatchObject({
      startDate: '2014',
      endDate: '2018',
    });
  });

  it('generates fresh, unique ids every time', () => {
    const a = toResumeContent(sampleParsedResume(), options).content;
    const b = toResumeContent(sampleParsedResume(), options).content;
    const ids = (c: typeof a) => c.sections.flatMap((s) => [s.id, ...s.entries.map((e) => e.id)]);
    expect(new Set([...ids(a), ...ids(b)]).size).toBe(ids(a).length * 2);
  });

  it('appends sections missing from section_order, and ignores unknown or repeated names', () => {
    const parsed = { ...sampleParsedResume(), section_order: ['skills', 'skills', 'hobbies'] };
    const { content } = toResumeContent(parsed, options);
    expect(content.sections.map((s) => s.type)).toEqual([
      'skills',
      'experience',
      'education',
      'custom',
    ]);
  });

  it('drops entries and sections with nothing in them', () => {
    const parsed = emptyParsedResume({
      basics: { ...emptyParsedResume().basics, full_name: 'Sam' },
      experience: [
        {
          position: ' ',
          company: null,
          location: null,
          start_date: null,
          end_date: null,
          current: false,
          summary: null,
          highlights: [],
        },
      ],
    });
    const { content, warnings } = toResumeContent(parsed, options);
    expect(content.sections).toEqual([]);
    expect(warnings).toContain('No work experience was found. Check that nothing is missing.');
  });

  it('cuts over-long fields to the domain limits instead of failing', () => {
    const parsed = emptyParsedResume({
      basics: { ...emptyParsedResume().basics, full_name: 'x'.repeat(500) },
    });
    expect(toResumeContent(parsed, options).content.basics.fullName).toHaveLength(120);
  });

  it('keeps at most 50 entries per section, with a warning', () => {
    const parsed = emptyParsedResume({
      basics: { ...emptyParsedResume().basics, full_name: 'Sam' },
      languages: Array.from({ length: 60 }, (_, i) => ({
        language: `L${String(i)}`,
        fluency: null,
      })),
    });
    const { content, warnings } = toResumeContent(parsed, options);
    expect(content.sections[0]?.entries).toHaveLength(50);
    expect(warnings.some((w) => w.includes('more than 50 entries'))).toBe(true);
  });

  it('refuses output with no resume content at all', () => {
    expect(() => toResumeContent(emptyParsedResume(), options)).toThrow(EmptyImportError);
  });

  it('warns about missing name and contact details', () => {
    const parsed = { ...sampleParsedResume(), basics: emptyParsedResume().basics };
    const { warnings } = toResumeContent(parsed, options);
    expect(warnings).toEqual(
      expect.arrayContaining([
        'No name was found. Add it under Personal details.',
        'No email or phone number was found.',
      ]),
    );
  });
});
