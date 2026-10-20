import type { ParsedResume } from '../../src/integrations/resume-parser/parsed-resume.js';

/** A valid parser output with everything empty; override what a test needs. */
export function emptyParsedResume(overrides: Partial<ParsedResume> = {}): ParsedResume {
  return {
    basics: {
      full_name: null,
      headline: null,
      email: null,
      phone: null,
      location: null,
      summary: null,
    },
    links: [],
    section_titles: {
      experience: null,
      education: null,
      skills: null,
      projects: null,
      certifications: null,
      awards: null,
      languages: null,
    },
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    awards: [],
    languages: [],
    custom_sections: [],
    section_order: [],
    ...overrides,
  };
}

export function sampleParsedResume(): ParsedResume {
  return emptyParsedResume({
    basics: {
      full_name: 'Jordan Example',
      headline: 'Product Engineer',
      email: 'jordan@example.com',
      phone: null,
      location: 'Berlin',
      summary: null,
    },
    section_titles: {
      experience: 'Work History',
      education: null,
      skills: null,
      projects: null,
      certifications: null,
      awards: null,
      languages: null,
    },
    experience: [
      {
        position: 'Senior Engineer',
        company: 'Example GmbH',
        location: null,
        start_date: '2021-03',
        end_date: 'Present',
        current: false,
        summary: null,
        highlights: ['Built the billing platform', '  ', 'Led a team of four'],
      },
    ],
    education: [
      {
        institution: 'Example University',
        degree: 'BSc',
        field: 'Computer Science',
        location: null,
        start_date: '2014',
        end_date: '2018',
        grade: null,
        summary: null,
      },
    ],
    skills: [{ name: null, keywords: ['TypeScript', 'PostgreSQL', 'Kubernetes'] }],
    custom_sections: [
      {
        title: 'Volunteering',
        entries: [
          { title: 'Mentor', subtitle: 'Code Club', date: '2020', summary: null, highlights: [] },
        ],
      },
    ],
    section_order: ['experience', 'custom:0', 'education', 'skills'],
  });
}
