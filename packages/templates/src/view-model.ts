import type { Basics, ResumeContent, ResumeSection, SectionType } from '@pypr/resume-core';

/**
 * The resume as templates see it: hidden sections and entries removed, text trimmed, empty
 * values dropped, dates formatted and links made safe. Keeps templates simple and consistent.
 */
export interface ResumeView {
  title: string;
  name: string;
  headline: string;
  summary: string;
  contacts: ContactItem[];
  sections: SectionView[];
}

export interface ContactItem {
  kind: 'email' | 'phone' | 'location' | 'website' | 'linkedin' | 'github';
  label: string;
  /** Only http(s), mailto and tel links; absent for plain text. */
  href?: string;
}

export interface SectionView {
  id: string;
  type: SectionType;
  title: string;
  entries: EntryView[];
}

/** A generic entry shape every section type maps onto. */
export interface EntryView {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  dates: string;
  href?: string;
  summary: string;
  bullets: string[];
  tags: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2021-04" -> "Apr 2021"; anything else passes through trimmed. */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1] ?? ''}` : value.trim();
}

export function formatRange(start: string, end: string, current = false): string {
  const from = formatMonth(start);
  const to = current ? 'Present' : formatMonth(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to;
}

/**
 * A safe link for user-entered text, or undefined. Adds https:// to bare domains; refuses
 * javascript:, data: and anything else that isn't a web or mail link.
 */
export function safeHref(raw: string, kind: 'web' | 'email' | 'phone' = 'web'): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (kind === 'email') {
    return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? `mailto:${value}` : undefined;
  }
  if (kind === 'phone') {
    const digits = value.replace(/[^\d+]/g, '');
    return digits.length >= 5 ? `tel:${digits}` : undefined;
  }
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** "https://www.linkedin.com/in/ada/" -> "linkedin.com/in/ada". */
export function displayUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

const clean = (items: readonly string[]) => items.map((i) => i.trim()).filter(Boolean);
const join = (parts: readonly string[], sep: string) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(sep);

function contactsOf(basics: Basics): ContactItem[] {
  const items: (ContactItem | null)[] = [
    basics.email.trim()
      ? { kind: 'email', label: basics.email.trim(), ...opt(safeHref(basics.email, 'email')) }
      : null,
    basics.phone.trim()
      ? { kind: 'phone', label: basics.phone.trim(), ...opt(safeHref(basics.phone, 'phone')) }
      : null,
    basics.location.trim() ? { kind: 'location', label: basics.location.trim() } : null,
    ...(['website', 'linkedin', 'github'] as const).map((kind): ContactItem | null =>
      basics[kind].trim()
        ? { kind, label: displayUrl(basics[kind]), ...opt(safeHref(basics[kind])) }
        : null,
    ),
  ];
  return items.filter((item): item is ContactItem => item !== null);
}

function opt(href: string | undefined): { href?: string } {
  return href ? { href } : {};
}

function entriesOf(section: ResumeSection): EntryView[] {
  const base = (id: string): EntryView => ({
    id,
    title: '',
    subtitle: '',
    meta: '',
    dates: '',
    summary: '',
    bullets: [],
    tags: [],
  });
  switch (section.type) {
    case 'experience':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: d.position.trim(),
          subtitle: d.company.trim(),
          meta: d.location.trim(),
          dates: formatRange(d.startDate, d.endDate, d.current),
          summary: d.summary.trim(),
          bullets: clean(d.highlights),
        }));
    case 'education':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: join([d.degree, d.field], ', '),
          subtitle: d.institution.trim(),
          meta: join([d.location, d.grade], ' · '),
          dates: formatRange(d.startDate, d.endDate),
          summary: d.summary.trim(),
        }));
    case 'skills':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({ ...base(id), title: d.name.trim(), tags: clean(d.keywords) }));
    case 'projects':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: d.name.trim(),
          subtitle: d.role.trim(),
          meta: d.url.trim() ? displayUrl(d.url) : '',
          ...opt(safeHref(d.url)),
          dates: formatRange(d.startDate, d.endDate),
          summary: d.summary.trim(),
          bullets: clean(d.highlights),
        }));
    case 'certifications':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: d.name.trim(),
          subtitle: d.issuer.trim(),
          dates: formatMonth(d.date),
          ...opt(safeHref(d.url)),
        }));
    case 'awards':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: d.title.trim(),
          subtitle: d.issuer.trim(),
          dates: formatMonth(d.date),
          summary: d.summary.trim(),
        }));
    case 'languages':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: d.language.trim(),
          subtitle: d.fluency.trim(),
        }));
    case 'custom':
      return section.entries
        .filter((e) => e.visible)
        .map(({ id, data: d }) => ({
          ...base(id),
          title: d.title.trim(),
          subtitle: d.subtitle.trim(),
          dates: d.date.trim(),
          summary: d.summary.trim(),
          bullets: clean(d.highlights),
        }));
  }
}

const isEmpty = (e: EntryView) =>
  !e.title &&
  !e.subtitle &&
  !e.meta &&
  !e.dates &&
  !e.summary &&
  e.bullets.length === 0 &&
  e.tags.length === 0;

export function toResumeView(content: ResumeContent): ResumeView {
  return {
    title: content.title.trim(),
    name: content.basics.fullName.trim(),
    headline: content.basics.headline.trim(),
    summary: content.basics.summary.trim(),
    contacts: contactsOf(content.basics),
    sections: content.sections
      .filter((s) => s.visible)
      .map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title.trim(),
        entries: entriesOf(s).filter((e) => !isEmpty(e)),
      }))
      .filter((s) => s.entries.length > 0),
  };
}
