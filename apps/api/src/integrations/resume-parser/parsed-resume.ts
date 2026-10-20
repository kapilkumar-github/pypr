import { z } from 'zod';

/**
 * What a resume parser returns (the port's output contract). It's shaped for AI structured
 * output: every field is present, missing values are null, standard sections are separate
 * arrays, and `section_order` keeps the document's order. It has no ids: those are generated
 * by Pypr during normalization, never taken from the model.
 */

const text = z.string().nullable();
const date = z
  .string()
  .nullable()
  .describe('"YYYY-MM" when the month is known, "YYYY" when only the year is, otherwise null');
const lines = z.array(z.string()).describe('Bullet points or achievements, as written');

const experience = z.strictObject({
  position: text,
  company: text,
  location: text,
  start_date: date,
  end_date: date.describe('null when the role is ongoing'),
  current: z.boolean().describe('true when the document says the role is ongoing'),
  summary: text,
  highlights: lines,
});

const education = z.strictObject({
  institution: text,
  degree: text,
  field: text,
  location: text,
  start_date: date,
  end_date: date,
  grade: text,
  summary: text,
});

const skillGroup = z.strictObject({
  name: text.describe('Group name such as "Languages"; null when the skills are ungrouped'),
  keywords: z.array(z.string()),
});

const project = z.strictObject({
  name: text,
  role: text,
  url: text,
  start_date: date,
  end_date: date,
  summary: text,
  highlights: lines,
});

const certification = z.strictObject({ name: text, issuer: text, date, url: text });
const award = z.strictObject({ title: text, issuer: text, date, summary: text });
const language = z.strictObject({ language: text, fluency: text });
const customEntry = z.strictObject({
  title: text,
  subtitle: text,
  date: text.describe('Any date text as written'),
  summary: text,
  highlights: lines,
});

export const STANDARD_PARSED_SECTIONS = [
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'awards',
  'languages',
] as const;

export const parsedResumeSchema = z.strictObject({
  basics: z.strictObject({
    full_name: text,
    headline: text.describe('Professional title, e.g. "Senior Software Engineer"'),
    email: text,
    phone: text,
    location: text,
    website: text,
    linkedin: text,
    github: text,
    summary: text,
  }),
  section_titles: z
    .strictObject({
      experience: text,
      education: text,
      skills: text,
      projects: text,
      certifications: text,
      awards: text,
      languages: text,
    })
    .describe('Each standard section heading as written in the document, or null'),
  experience: z.array(experience),
  education: z.array(education),
  skills: z.array(skillGroup),
  projects: z.array(project),
  certifications: z.array(certification),
  awards: z.array(award),
  languages: z.array(language),
  custom_sections: z
    .array(z.strictObject({ title: z.string(), entries: z.array(customEntry) }))
    .describe('Sections that fit none of the standard ones (volunteering, publications, ...)'),
  section_order: z
    .array(z.string())
    .describe(
      'Sections in document order, using "experience", "education", "skills", "projects", ' +
        '"certifications", "awards", "languages", or "custom:<index into custom_sections>"',
    ),
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

/** JSON Schema for providers' structured-output modes (strict: closed objects, all fields required). */
export function parsedResumeJsonSchema(): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(parsedResumeSchema) as Record<string, unknown>;
  return schema;
}
