import {
  DEFAULT_SECTION_TITLES,
  RESUME_LIMITS,
  basicsSchema,
  emptyBasics,
  entryDataSchemas,
  isWebUrl,
  resumeContentSchema,
  type ResumeContent,
  type ResumeSection,
  type SectionType,
} from '@pypr/resume-core';
import type { z } from 'zod';
import {
  STANDARD_PARSED_SECTIONS,
  type ParsedResume,
} from '../integrations/resume-parser/parsed-resume.js';

type NewId = () => string;
const randomId: NewId = () => crypto.randomUUID();

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  sept: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * A parsed date as the domain's "YYYY-MM" / "YYYY" / "". Accepts the formats models commonly
 * return despite instructions ("2021-4", "04/2021", "Apr 2021"); anything else becomes "".
 */
export function normalizeDate(value: string | null): string {
  const v = (value ?? '').trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(v);
  if (m) return monthOf(m[1], m[2]);
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return monthOf(m[2], m[1]);
  m = /^([a-z]{3,9})\.?\s+(\d{4})$/.exec(v);
  if (m) {
    const month = MONTHS[(m[1] ?? '').slice(0, 4)] ?? MONTHS[(m[1] ?? '').slice(0, 3)];
    return month ? `${m[2] ?? ''}-${month}` : '';
  }
  m = /^(\d{4})$/.exec(v);
  return m ? (m[1] ?? '') : '';
}

function monthOf(year: string | undefined, month: string | undefined): string {
  const n = Number(month);
  return year && n >= 1 && n <= 12 ? `${year}-${String(n).padStart(2, '0')}` : (year ?? '');
}

/** Looks like "present", "current", "now", "ongoing". */
function isOngoing(value: string | null): boolean {
  return /^(present|current|now|ongoing|today)$/i.test((value ?? '').trim());
}

/** Trims, turns null into "", and cuts to the domain field's maximum length. */
function fit(value: string | null, schema: z.ZodType): string {
  const max = (schema as { maxLength?: number | null }).maxLength ?? 10_000;
  return (value ?? '').trim().slice(0, max);
}

function fitList(values: readonly string[], schema: z.ZodType): string[] {
  const item = (schema as { element?: z.ZodType }).element ?? schema;
  return values
    .map((v) => fit(v, item))
    .filter(Boolean)
    .slice(0, RESUME_LIMITS.listItems);
}

/** Fills `data` for a section type, fitting every field to the domain schema. */
function entryData(type: SectionType, raw: Record<string, unknown>): Record<string, unknown> {
  const shape = entryDataSchemas[type].shape as Record<string, z.ZodType>;
  const data: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(shape)) {
    const value = raw[key];
    if (key === 'current') data[key] = value === true;
    else if (Array.isArray(value)) data[key] = fitList(value as string[], schema);
    else if (['startDate', 'endDate', 'date'].includes(key) && type !== 'custom') {
      data[key] = normalizeDate(typeof value === 'string' ? value : null);
    } else data[key] = fit(typeof value === 'string' ? value : null, schema);
  }
  return data;
}

const isEmptyData = (data: Record<string, unknown>) =>
  Object.values(data).every((v) => v === '' || v === false || (Array.isArray(v) && v.length === 0));

/**
 * The model's links as entries. An address that isn't a web address (or is an email) is never
 * linked: it's kept as the label for the user to fix, as in the schema version 3 upgrade.
 */
function linkEntries(parsed: ParsedResume): Record<string, unknown>[] {
  const shape = entryDataSchemas.links.shape;
  return parsed.links.map((link) => {
    const label = fit(link.label, shape.label);
    const url = fit(link.url, shape.url);
    if (!url || isWebUrl(url)) return { label, url };
    return { label: fit([label, url].filter(Boolean).join(': '), shape.label), url: '' };
  });
}

/** Per standard section: the model's entries mapped to domain field names. */
function standardEntries(parsed: ParsedResume, type: (typeof STANDARD_PARSED_SECTIONS)[number]) {
  switch (type) {
    case 'experience':
      return parsed.experience.map((e) => ({
        position: e.position,
        company: e.company,
        location: e.location,
        startDate: e.start_date,
        endDate: isOngoing(e.end_date) ? null : e.end_date,
        current: e.current || isOngoing(e.end_date),
        summary: e.summary,
        highlights: e.highlights,
      }));
    case 'education':
      return parsed.education.map((e) => ({ ...e, startDate: e.start_date, endDate: e.end_date }));
    case 'skills':
      return parsed.skills.map((e) => ({ name: e.name, keywords: e.keywords }));
    case 'projects':
      return parsed.projects.map((e) => ({ ...e, startDate: e.start_date, endDate: e.end_date }));
    case 'certifications':
      return parsed.certifications;
    case 'awards':
      return parsed.awards;
    case 'languages':
      return parsed.languages;
  }
}

export interface NormalizedImport {
  content: ResumeContent;
  warnings: string[];
}

export class EmptyImportError extends Error {
  override readonly name = 'EmptyImportError';
}

/**
 * Parser output -> validated domain content. Ids are always generated here, never taken from the
 * model. Hidden assumptions are avoided: empty entries and sections are dropped, limits are
 * enforced with a warning, and the result must pass `resumeContentSchema`.
 */
export function toResumeContent(
  parsed: ParsedResume,
  options: { title: string; template: string; newId?: NewId },
): NormalizedImport {
  const newId = options.newId ?? randomId;
  const warnings: string[] = [];

  const b = parsed.basics;
  const basicsShape = basicsSchema.shape;
  const basics = {
    ...emptyBasics(),
    fullName: fit(b.full_name, basicsShape.fullName),
    headline: fit(b.headline, basicsShape.headline),
    email: fit(b.email, basicsShape.email),
    phone: fit(b.phone, basicsShape.phone),
    location: fit(b.location, basicsShape.location),
    summary: fit(b.summary, basicsShape.summary),
  };

  const build = (type: SectionType, title: string, rawEntries: Record<string, unknown>[]) => {
    const entries = rawEntries
      .map((raw) => entryData(type, raw))
      .filter((data) => !isEmptyData(data));
    if (entries.length > RESUME_LIMITS.entriesPerSection) {
      warnings.push(
        `"${title}" had more than ${String(RESUME_LIMITS.entriesPerSection)} entries; only the first ${String(RESUME_LIMITS.entriesPerSection)} were kept.`,
      );
    }
    if (entries.length === 0) return null;
    return {
      id: newId(),
      type,
      title: title.trim().slice(0, 80) || DEFAULT_SECTION_TITLES[type],
      visible: true,
      entries: entries
        .slice(0, RESUME_LIMITS.entriesPerSection)
        .map((data) => ({ id: newId(), visible: true, data })),
    } as unknown as ResumeSection;
  };

  // Every section the model produced, keyed by its section_order name.
  const available = new Map<string, () => ResumeSection | null>();
  for (const type of STANDARD_PARSED_SECTIONS) {
    available.set(type, () =>
      build(type, parsed.section_titles[type] ?? '', standardEntries(parsed, type)),
    );
  }
  parsed.custom_sections.forEach((section, i) => {
    available.set(`custom:${String(i)}`, () => build('custom', section.title, section.entries));
  });

  // Document order first, then anything the order list missed, each at most once.
  const order = [...parsed.section_order.map((s) => s.trim().toLowerCase()), ...available.keys()];
  // Websites and profiles go into a Websites & Profiles section first, near the contact details.
  const links = build('links', '', linkEntries(parsed));
  const sections: ResumeSection[] = links ? [links] : [];
  const used = new Set<string>();
  for (const key of order) {
    const make = available.get(key);
    if (!make || used.has(key)) continue;
    used.add(key);
    const section = make();
    if (section) sections.push(section);
  }
  if (sections.length > RESUME_LIMITS.sections) {
    warnings.push(`Only the first ${String(RESUME_LIMITS.sections)} sections were kept.`);
  }

  const content = {
    title: options.title,
    template: options.template,
    basics,
    sections: sections.slice(0, RESUME_LIMITS.sections),
  };

  const hasBasics = Object.values(basics).some((v) => v !== '');
  if (!hasBasics && content.sections.length === 0) {
    throw new EmptyImportError('No resume content was found in the document');
  }
  if (!basics.fullName) warnings.push('No name was found. Add it under Personal details.');
  if (!basics.email && !basics.phone) warnings.push('No email or phone number was found.');
  if (!content.sections.some((s) => s.type === 'experience')) {
    warnings.push('No work experience was found. Check that nothing is missing.');
  }

  // Final guard: never hand over content the rest of the app would reject.
  return { content: resumeContentSchema.parse(content), warnings };
}
