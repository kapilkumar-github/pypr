import { SECTION_TYPES, emptyEntryData } from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { ENTRY_FIELDS, entryLabel, listCodec } from './fields';

describe('ENTRY_FIELDS', () => {
  it('only references fields that exist on each entry type', () => {
    for (const type of SECTION_TYPES) {
      const keys = Object.keys(emptyEntryData(type));
      for (const field of ENTRY_FIELDS[type]) expect(keys).toContain(field.key);
    }
  });
});

describe('listCodec', () => {
  it.each(['a\nb', 'a\n', '', 'one\n\ntwo'])('lines round-trip %j exactly', (text) => {
    expect(listCodec.lines.toText(listCodec.lines.toItems(text))).toBe(text);
  });

  it('shows tags comma-separated and stores them trimmed', () => {
    expect(listCodec.tags.toItems(' TypeScript,React , ,Go,')).toEqual([
      'TypeScript',
      'React',
      'Go',
    ]);
    expect(listCodec.tags.toText(['TypeScript', 'React'])).toBe('TypeScript, React');
  });
});

describe('entryLabel', () => {
  it('describes entries briefly', () => {
    expect(
      entryLabel('experience', {
        ...emptyEntryData('experience'),
        position: 'Engineer',
        company: 'Acme',
      }),
    ).toBe('Engineer at Acme');
    expect(entryLabel('experience', emptyEntryData('experience'))).toBe('');
    expect(entryLabel('skills', { name: '', keywords: ['TypeScript', 'Go'] })).toBe(
      'TypeScript, Go',
    );
  });
});

describe('links entries', () => {
  it('are labelled by their label, or their address when unlabelled', () => {
    expect(entryLabel('links', { label: ' Portfolio ', url: 'ada.dev' })).toBe('Portfolio');
    expect(entryLabel('links', { label: '', url: 'ada.dev' })).toBe('ada.dev');
  });
});
