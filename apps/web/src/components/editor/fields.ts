import type { EntryData, SectionType } from '@pypr/resume-core';

export type FieldKind = 'text' | 'textarea' | 'richtext' | 'month' | 'lines' | 'tags' | 'checkbox';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** Takes half the row on wide screens. */
  half?: boolean;
  placeholder?: string;
  hint?: string;
}

const dates: FieldSpec[] = [
  { key: 'startDate', label: 'Start', kind: 'month', half: true },
  { key: 'endDate', label: 'End', kind: 'month', half: true },
];

/** Which inputs each section type's entries have, in display order. */
export const ENTRY_FIELDS: Record<SectionType, FieldSpec[]> = {
  experience: [
    { key: 'position', label: 'Job title', kind: 'text', half: true },
    { key: 'company', label: 'Company', kind: 'text', half: true },
    { key: 'location', label: 'Location', kind: 'text', half: true },
    { key: 'current', label: 'I work here now', kind: 'checkbox', half: true },
    ...dates,
    { key: 'summary', label: 'Summary', kind: 'richtext' },
    { key: 'highlights', label: 'Highlights', kind: 'lines', hint: 'One per line.' },
  ],
  education: [
    { key: 'institution', label: 'School', kind: 'text', half: true },
    { key: 'degree', label: 'Degree', kind: 'text', half: true },
    { key: 'field', label: 'Field of study', kind: 'text', half: true },
    { key: 'location', label: 'Location', kind: 'text', half: true },
    ...dates,
    { key: 'grade', label: 'Grade', kind: 'text', half: true },
    { key: 'summary', label: 'Summary', kind: 'richtext' },
  ],
  skills: [
    { key: 'name', label: 'Skill group', kind: 'text', placeholder: 'e.g. Languages' },
    {
      key: 'keywords',
      label: 'Skills',
      kind: 'tags',
      placeholder: 'TypeScript, React, PostgreSQL',
      hint: 'Separate with commas.',
    },
  ],
  projects: [
    { key: 'name', label: 'Project', kind: 'text', half: true },
    { key: 'role', label: 'Role', kind: 'text', half: true },
    { key: 'url', label: 'Link', kind: 'text', placeholder: 'https://' },
    ...dates,
    { key: 'summary', label: 'Summary', kind: 'richtext' },
    { key: 'highlights', label: 'Highlights', kind: 'lines', hint: 'One per line.' },
  ],
  certifications: [
    { key: 'name', label: 'Certification', kind: 'text', half: true },
    { key: 'issuer', label: 'Issuer', kind: 'text', half: true },
    { key: 'date', label: 'Date', kind: 'month', half: true },
    { key: 'url', label: 'Link', kind: 'text', half: true, placeholder: 'https://' },
  ],
  awards: [
    { key: 'title', label: 'Award', kind: 'text', half: true },
    { key: 'issuer', label: 'Awarded by', kind: 'text', half: true },
    { key: 'date', label: 'Date', kind: 'month', half: true },
    { key: 'summary', label: 'Summary', kind: 'richtext' },
  ],
  languages: [
    { key: 'language', label: 'Language', kind: 'text', half: true },
    { key: 'fluency', label: 'Fluency', kind: 'text', half: true, placeholder: 'e.g. Native' },
  ],
  links: [
    {
      key: 'label',
      label: 'Label',
      kind: 'text',
      half: true,
      placeholder: 'e.g. Portfolio, LinkedIn, Blog',
    },
    {
      key: 'url',
      label: 'URL',
      kind: 'text',
      half: true,
      placeholder: 'example.com/you',
      hint: 'Any website or profile.',
    },
  ],
  custom: [
    { key: 'title', label: 'Title', kind: 'text', half: true },
    { key: 'subtitle', label: 'Subtitle', kind: 'text', half: true },
    { key: 'date', label: 'Date', kind: 'text', half: true, placeholder: 'e.g. 2023' },
    { key: 'summary', label: 'Summary', kind: 'richtext' },
    { key: 'highlights', label: 'Highlights', kind: 'lines', hint: 'One per line.' },
  ],
};

/** Short label for a collapsed entry, e.g. "Engineer at Acme". */
export function entryLabel(type: SectionType, data: EntryData): string {
  const d = data as Record<string, unknown>;
  const s = (key: string) => (typeof d[key] === 'string' ? d[key].trim() : '');
  const join = (a: string, b: string, sep: string) => [a, b].filter(Boolean).join(sep);
  switch (type) {
    case 'experience':
      return join(s('position'), s('company'), ' at ');
    case 'education':
      return join(s('degree'), s('institution'), ', ');
    case 'skills': {
      const keywords = Array.isArray(d.keywords) ? (d.keywords as string[]) : [];
      return (
        s('name') ||
        keywords
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 4)
          .join(', ')
      );
    }
    case 'projects':
      return s('name');
    case 'certifications':
      return s('name');
    case 'awards':
      return s('title');
    case 'languages':
      return s('language');
    case 'links':
      return s('label') || s('url');
    case 'custom':
      return s('title');
  }
}

/**
 * List fields. Lines round-trip exactly (one bullet per textarea line). Tags are shown as
 * "a, b, c" and stored trimmed; the field keeps the user's raw text while focused, so the
 * cursor never jumps.
 */
export const listCodec = {
  lines: {
    toText: (items: string[]) => items.join('\n'),
    toItems: (text: string) => text.split('\n'),
  },
  tags: {
    toText: (items: string[]) => items.join(', '),
    toItems: (text: string) =>
      text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
  },
};
