import { describe, expect, it } from 'vitest';
import { createResumeContent } from './operations.js';
import { createEntry, createSection } from './operations.js';
import {
  RESUME_SCHEMA_VERSION,
  ResumeVersionError,
  mergeDuplicateStandardSections,
  moveLegacyLinks,
  upgradeResumeContent,
} from './versioning.js';

const current = createResumeContent({ title: 'CV', template: 'classic' });

describe('upgradeResumeContent', () => {
  it('is at version 3 and validates current content as is', () => {
    expect(RESUME_SCHEMA_VERSION).toBe(3);
    expect(upgradeResumeContent(current, 3)).toEqual(current);
    expect(upgradeResumeContent(current, 2)).toEqual(current);
    expect(upgradeResumeContent(current, 1)).toEqual(current);
  });

  it('version 1 -> 2 merges duplicate standard sections, keeping every entry in order', () => {
    const first = { ...createSection('experience'), entries: [createEntry('experience')] };
    const second = {
      ...createSection('experience'),
      title: 'More work',
      entries: [createEntry('experience')],
    };
    const customA = createSection('custom');
    const customB = createSection('custom');
    const v1 = { ...current, sections: [first, customA, second, customB] };

    const upgraded = upgradeResumeContent(v1, 1);
    expect(upgraded.sections.map((s) => s.id)).toEqual([first.id, customA.id, customB.id]);
    expect(upgraded.sections[0]?.title).toBe(first.title);
    expect(upgraded.sections[0]?.entries.map((e) => e.id)).toEqual([
      first.entries[0]?.id,
      second.entries[0]?.id,
    ]);
    // The input isn't mutated.
    expect(v1.sections[0]?.entries).toHaveLength(1);
    expect(mergeDuplicateStandardSections('not an object')).toBe('not an object');
  });

  it('applies each upgrade step in order, then validates', () => {
    const { title, ...rest } = current;
    // Pretend version 1 called the title "name", and version 2 lowercased templates.
    const stored = { ...rest, name: title, template: 'CLASSIC' };
    const upgraded = upgradeResumeContent(stored, 1, {
      toVersion: 3,
      upgrades: {
        1: (c) => {
          const { name, ...others } = c as { name: string };
          return { ...others, title: name };
        },
        2: (c) => ({
          ...(c as object),
          template: (c as { template: string }).template.toLowerCase(),
        }),
      },
    });
    expect(upgraded).toEqual(current);
  });

  it('refuses versions newer than the code, invalid versions, and gaps', () => {
    expect(() => upgradeResumeContent(current, 4)).toThrow(ResumeVersionError);
    expect(() => upgradeResumeContent(current, 0)).toThrow(ResumeVersionError);
    expect(() => upgradeResumeContent(current, 1, { toVersion: 4 })).toThrow(/No upgrade from/);
  });

  it('rejects content that is invalid after upgrading', () => {
    expect(() => upgradeResumeContent({ ...current, sections: 'nope' }, 1)).toThrow();
  });
});

describe('version 2 -> 3: legacy link fields', () => {
  const v2 = (links: { website?: string; linkedin?: string; github?: string }) => ({
    ...current,
    basics: { ...current.basics, website: '', linkedin: '', github: '', ...links },
  });

  it('moves them into a Websites & Profiles section placed first', () => {
    const upgraded = upgradeResumeContent(
      v2({ website: ' ada.dev ', linkedin: 'https://linkedin.com/in/ada', github: '' }),
      2,
    );
    expect(upgraded.basics).toEqual(current.basics);
    const [links, ...rest] = upgraded.sections;
    expect(links).toMatchObject({ type: 'links', title: 'Websites & Profiles', visible: true });
    expect(links?.entries.map((e) => e.data)).toEqual([
      { label: 'Website', url: 'ada.dev' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
    ]);
    expect(rest).toEqual(current.sections);
  });

  it('keeps a value that is not a web address as a label, without a URL', () => {
    const upgraded = upgradeResumeContent(v2({ github: 'ada on github' }), 2);
    expect(upgraded.sections[0]?.entries[0]?.data).toEqual({ label: 'ada on github', url: '' });
  });

  it('adds nothing when the fields are empty, and fits a resume already at the old limit', () => {
    expect(upgradeResumeContent(v2({}), 2).sections).toEqual(current.sections);
    const full = {
      ...v2({ website: 'ada.dev' }),
      sections: Array.from({ length: 20 }, () => createSection('custom')),
    };
    expect(upgradeResumeContent(full, 2).sections).toHaveLength(21);
    expect(moveLegacyLinks(null)).toBeNull();
  });
});
