import type { Basics, EntryData, SectionType } from './schema.js';

export const DEFAULT_SECTION_TITLES: Record<SectionType, string> = {
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  languages: 'Languages',
  links: 'Websites & Profiles',
  custom: 'Additional',
};

export function emptyBasics(): Basics {
  return {
    fullName: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    summary: '',
  };
}

const dates = { startDate: '', endDate: '' } as const;

export function emptyEntryData<T extends SectionType>(type: T): EntryData<T> {
  const byType: { [K in SectionType]: () => EntryData<K> } = {
    experience: () => ({
      position: '',
      company: '',
      location: '',
      ...dates,
      current: false,
      summary: '',
      highlights: [],
    }),
    education: () => ({
      institution: '',
      degree: '',
      field: '',
      location: '',
      ...dates,
      grade: '',
      summary: '',
    }),
    skills: () => ({ name: '', keywords: [] }),
    projects: () => ({ name: '', role: '', url: '', ...dates, summary: '', highlights: [] }),
    certifications: () => ({ name: '', issuer: '', date: '', url: '' }),
    awards: () => ({ title: '', issuer: '', date: '', summary: '' }),
    languages: () => ({ language: '', fluency: '' }),
    links: () => ({ label: '', url: '' }),
    custom: () => ({ title: '', subtitle: '', date: '', summary: '', highlights: [] }),
  };
  return byType[type]();
}
