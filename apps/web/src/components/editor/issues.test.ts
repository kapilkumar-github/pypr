import { addEntry, createResumeContent, updateBasics, updateEntryData } from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { groupIssues } from './issues';

describe('groupIssues', () => {
  it('is empty for valid content', () => {
    expect(groupIssues(createResumeContent({ title: 'CV', template: 'classic' })).count).toBe(0);
  });

  it('places basics and entry field problems', () => {
    let content = createResumeContent({ title: 'CV', template: 'classic' });
    const section = content.sections[0]?.id ?? '';
    content = addEntry(content, section);
    const entry = content.sections[0]?.entries[0]?.id ?? '';
    content = updateEntryData<'experience'>(content, section, entry, { startDate: 'March' });
    content = updateBasics(content, { fullName: 'x'.repeat(200) });

    const issues = groupIssues(content);
    expect(issues.count).toBe(2);
    expect(issues.basics.has('fullName')).toBe(true);
    expect(issues.sections.get(section)?.get(`${entry}.startDate`)).toBeDefined();
  });
});
