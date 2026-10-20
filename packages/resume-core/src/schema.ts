import { z } from 'zod';

/**
 * Resume content model (decision D3). Drafts are saved as the user types, so text fields are
 * plain strings that may be empty; templates skip empty values. Only lengths and formats are
 * enforced, never "required".
 */

export const RESUME_LIMITS = {
  sections: 20,
  entriesPerSection: 50,
  listItems: 30,
} as const;

const text = (max: number) => z.string().max(max);
const list = (maxItemLength: number) => z.array(text(maxItemLength)).max(RESUME_LIMITS.listItems);

/**
 * A month like "2024-03", a year alone like "2024" (common in resumes; never padded with an
 * invented month), or "" when unknown.
 */
export const yearMonthSchema = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Use the format YYYY-MM or YYYY'),
]);
export type YearMonth = z.infer<typeof yearMonthSchema>;

export const basicsSchema = z.strictObject({
  fullName: text(120),
  headline: text(160),
  email: text(320),
  phone: text(40),
  location: text(120),
  website: text(300),
  linkedin: text(300),
  github: text(300),
  summary: text(3000),
});
export type Basics = z.infer<typeof basicsSchema>;

export const SECTION_TYPES = [
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'awards',
  'languages',
  'custom',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Standard sections appear at most once per resume; any number of custom sections is allowed. */
export const STANDARD_SECTION_TYPES = SECTION_TYPES.filter(
  (type): type is Exclude<SectionType, 'custom'> => type !== 'custom',
);
export type StandardSectionType = (typeof STANDARD_SECTION_TYPES)[number];

export function isStandardSectionType(type: SectionType): type is StandardSectionType {
  return type !== 'custom';
}

export const entryDataSchemas = {
  experience: z.strictObject({
    position: text(120),
    company: text(120),
    location: text(120),
    startDate: yearMonthSchema,
    endDate: yearMonthSchema,
    current: z.boolean(),
    summary: text(2000),
    highlights: list(300),
  }),
  education: z.strictObject({
    institution: text(160),
    degree: text(120),
    field: text(120),
    location: text(120),
    startDate: yearMonthSchema,
    endDate: yearMonthSchema,
    grade: text(40),
    summary: text(2000),
  }),
  skills: z.strictObject({
    name: text(80),
    keywords: list(60),
  }),
  projects: z.strictObject({
    name: text(120),
    role: text(120),
    url: text(300),
    startDate: yearMonthSchema,
    endDate: yearMonthSchema,
    summary: text(2000),
    highlights: list(300),
  }),
  certifications: z.strictObject({
    name: text(160),
    issuer: text(120),
    date: yearMonthSchema,
    url: text(300),
  }),
  awards: z.strictObject({
    title: text(160),
    issuer: text(120),
    date: yearMonthSchema,
    summary: text(1000),
  }),
  languages: z.strictObject({
    language: text(60),
    fluency: text(60),
  }),
  custom: z.strictObject({
    title: text(160),
    subtitle: text(160),
    date: text(60),
    summary: text(2000),
    highlights: list(300),
  }),
} satisfies Record<SectionType, z.ZodType>;

export type EntryDataMap = { [T in SectionType]: z.infer<(typeof entryDataSchemas)[T]> };
export type EntryData<T extends SectionType = SectionType> = EntryDataMap[T];

const idSchema = z.uuid();

function sectionSchema<T extends SectionType>(type: T) {
  return z.strictObject({
    id: idSchema,
    type: z.literal(type),
    title: text(80),
    visible: z.boolean(),
    entries: z
      .array(
        z.strictObject({
          id: idSchema,
          visible: z.boolean(),
          data: entryDataSchemas[type],
        }),
      )
      .max(RESUME_LIMITS.entriesPerSection),
  });
}

export const sectionSchemaByType = {
  experience: sectionSchema('experience'),
  education: sectionSchema('education'),
  skills: sectionSchema('skills'),
  projects: sectionSchema('projects'),
  certifications: sectionSchema('certifications'),
  awards: sectionSchema('awards'),
  languages: sectionSchema('languages'),
  custom: sectionSchema('custom'),
} satisfies Record<SectionType, z.ZodType>;

export const resumeSectionSchema = z.discriminatedUnion('type', [
  sectionSchemaByType.experience,
  sectionSchemaByType.education,
  sectionSchemaByType.skills,
  sectionSchemaByType.projects,
  sectionSchemaByType.certifications,
  sectionSchemaByType.awards,
  sectionSchemaByType.languages,
  sectionSchemaByType.custom,
]);
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type SectionOf<T extends SectionType> = Extract<ResumeSection, { type: T }>;
export type ResumeEntry<T extends SectionType = SectionType> = SectionOf<T>['entries'][number];

/**
 * Presentation settings of one resume (decision D25): how it looks, separate from what it says.
 * Fonts are ids; @pypr/templates maps them to font stacks.
 */
export const RESUME_FONTS = [
  'helvetica',
  'system',
  'verdana',
  'georgia',
  'palatino',
  'times',
] as const;
export type ResumeFont = (typeof RESUME_FONTS)[number];
export const RESUME_DENSITIES = ['compact', 'normal', 'spaced'] as const;
export type ResumeDensity = (typeof RESUME_DENSITIES)[number];

/** "#RRGGBB", stored uppercase. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #B7FF3C')
  .transform((value) => value.toUpperCase());

export const DEFAULT_RESUME_SETTINGS = {
  accentColor: '#B7FF3C',
  font: 'helvetica',
  density: 'normal',
} as const satisfies { accentColor: string; font: ResumeFont; density: ResumeDensity };

export const resumeSettingsSchema = z.strictObject({
  accentColor: hexColorSchema,
  font: z.enum(RESUME_FONTS),
  density: z.enum(RESUME_DENSITIES),
});
export type ResumeSettings = z.infer<typeof resumeSettingsSchema>;

/** Template ids are short slugs; which ones exist is decided by @pypr/templates. */
export const templateIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Unknown template');

/** Everything the user edits. Order of sections and entries is their array order. */
export const resumeContentSchema = z
  .strictObject({
    title: text(120),
    template: templateIdSchema,
    /** Missing in content saved before settings existed: defaults apply. */
    settings: resumeSettingsSchema.default({ ...DEFAULT_RESUME_SETTINGS }),
    basics: basicsSchema,
    sections: z.array(resumeSectionSchema).max(RESUME_LIMITS.sections),
  })
  .superRefine((content, ctx) => {
    // Each standard section type at most once (custom sections are exempt).
    const standard = new Set<SectionType>();
    content.sections.forEach((section, s) => {
      if (!isStandardSectionType(section.type)) return;
      if (standard.has(section.type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', s, 'type'],
          message: `A resume can have only one ${section.type} section`,
        });
      }
      standard.add(section.type);
    });

    // Ids must be unique: the server updates rows by id (decision D3).
    const seen = new Set<string>();
    content.sections.forEach((section, s) => {
      const ids: [string, (string | number)[]][] = [
        [section.id, ['sections', s, 'id']],
        ...section.entries.map((entry, e): [string, (string | number)[]] => [
          entry.id,
          ['sections', s, 'entries', e, 'id'],
        ]),
      ];
      for (const [id, path] of ids) {
        if (seen.has(id)) ctx.addIssue({ code: 'custom', path, message: 'Duplicate id' });
        seen.add(id);
      }
    });
  });
export type ResumeContent = z.infer<typeof resumeContentSchema>;
