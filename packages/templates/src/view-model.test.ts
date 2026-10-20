import {
  addEntry,
  addSection,
  createResumeContent,
  setEntryVisible,
  updateBasics,
  updateEntryData,
  updateSection,
} from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { formatMonth, formatRange, safeHref, toResumeView } from './view-model.js';

describe('formatting', () => {
  it('formats months and ranges', () => {
    expect(formatMonth('2021-04')).toBe('Apr 2021');
    expect(formatMonth('')).toBe('');
    expect(formatRange('2021-04', '2023-01')).toBe('Apr 2021 – Jan 2023');
    expect(formatRange('2021-04', '', true)).toBe('Apr 2021 – Present');
    expect(formatRange('', '2020-06')).toBe('Jun 2020');
    expect(formatRange('2020-06', '2020-06')).toBe('Jun 2020');
  });
});

describe('safeHref', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['https://example.com/a', 'https://example.com/a'],
    ['linkedin.com/in/ada', 'https://linkedin.com/in/ada'],
  ])('links %s', (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://files.example.com', '', ' '])(
    'refuses %j',
    (input) => {
      expect(safeHref(input)).toBeUndefined();
    },
  );

  it('handles email and phone', () => {
    expect(safeHref('ada@example.com', 'email')).toBe('mailto:ada@example.com');
    expect(safeHref('not an email', 'email')).toBeUndefined();
    expect(safeHref('+44 (20) 7946 0958', 'phone')).toBe('tel:+442079460958');
  });
});

describe('toResumeView', () => {
  it('drops hidden and empty sections and entries, and trims text', () => {
    let content = createResumeContent({ title: 'CV', template: 'classic' });
    content = updateBasics(content, { fullName: '  Ada  ', location: ' London ' });
    const [experience, education] = content.sections.map((s) => s.id) as [string, string];
    content = addEntry(addEntry(content, experience), experience);
    const [shown, hidden] = content.sections[0]?.entries.map((e) => e.id) as [string, string];
    content = updateEntryData<'experience'>(content, experience, shown, {
      position: 'Engineer',
      highlights: ['  Built things ', '', ' '],
      startDate: '2020-01',
      current: true,
    });
    content = updateEntryData<'experience'>(content, experience, hidden, { position: 'Secret' });
    content = setEntryVisible(content, experience, hidden, false);
    content = addEntry(content, education); // empty entry
    content = addSection(content, 'awards');
    content = updateSection(content, experience, { title: ' Work ' });

    const view = toResumeView(content);
    expect(view.name).toBe('Ada');
    expect(view.contacts).toEqual([{ kind: 'location', label: 'London' }]);
    expect(view.sections.map((s) => s.title)).toEqual(['Work']);
    expect(view.sections[0]?.entries).toHaveLength(1);
    expect(view.sections[0]?.entries[0]).toMatchObject({
      title: 'Engineer',
      dates: 'Jan 2020 – Present',
      bullets: ['Built things'],
    });
  });
});

describe('links section', () => {
  it('uses the label with the printed address, or the address alone, and links safely', () => {
    let content = addSection(createResumeContent({ title: 'CV', template: 'classic' }), 'links');
    const links = content.sections.at(-1)?.id ?? '';
    for (let i = 0; i < 4; i += 1) content = addEntry(content, links);
    const ids = content.sections.at(-1)?.entries.map((e) => e.id) ?? [];
    const data = [
      { label: 'Portfolio', url: 'https://www.ada.dev/' },
      { label: '', url: 'behance.net/ada' },
      { label: 'Old blog', url: '' },
      { label: 'Bad', url: 'javascript:alert(1)' },
    ];
    ids.forEach((id, i) => {
      content = updateEntryData<'links'>(content, links, id, data[i] ?? {});
    });

    const entries = toResumeView(content).sections.find((s) => s.type === 'links')?.entries;
    expect(entries?.map(({ title, meta, href }) => ({ title, meta, href }))).toEqual([
      { title: 'Portfolio', meta: 'ada.dev', href: 'https://www.ada.dev/' },
      { title: 'behance.net/ada', meta: '', href: 'https://behance.net/ada' },
      { title: 'Old blog', meta: '', href: undefined },
      { title: 'Bad', meta: 'javascript:alert(1)', href: undefined },
    ]);
  });
});
