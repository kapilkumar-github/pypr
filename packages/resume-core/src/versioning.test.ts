import { describe, expect, it } from 'vitest';
import { createResumeContent } from './operations.js';
import { createEntry, createSection } from './operations.js';
import {
  RESUME_SCHEMA_VERSION,
  ResumeVersionError,
  mergeDuplicateStandardSections,
  upgradeResumeContent,
} from './versioning.js';

const current = createResumeContent({ title: 'CV', template: 'classic' });

describe('upgradeResumeContent', () => {
  it('is at version 2 and validates current content as is', () => {
    expect(RESUME_SCHEMA_VERSION).toBe(2);
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
    expect(() => upgradeResumeContent(current, 3)).toThrow(ResumeVersionError);
    expect(() => upgradeResumeContent(current, 0)).toThrow(ResumeVersionError);
    expect(() => upgradeResumeContent(current, 1, { toVersion: 3 })).toThrow(/No upgrade from/);
  });

  it('rejects content that is invalid after upgrading', () => {
    expect(() => upgradeResumeContent({ ...current, sections: 'nope' }, 1)).toThrow();
  });
});
