import { addEntry, createResumeContent, updateBasics, updateEntryData } from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { renderResumeHtml } from './render.js';
import { DEFAULT_TEMPLATE_ID, getTemplate, isTemplateId } from './registry.js';

function sample() {
  let content = createResumeContent({ title: 'CV', template: 'classic' });
  content = updateBasics(content, { fullName: 'Ada Lovelace', email: 'ada@example.com' });
  const experience = content.sections[0]?.id ?? '';
  content = addEntry(content, experience);
  const entry = content.sections[0]?.entries[0]?.id ?? '';
  return updateEntryData<'experience'>(content, experience, entry, {
    position: 'Analyst',
    company: 'Engines Ltd',
    highlights: ['Wrote the first program'],
  });
}

describe('renderResumeHtml', () => {
  it('renders a complete document with the content', () => {
    const html = renderResumeHtml(sample());
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('href="mailto:ada@example.com"');
    expect(html).toContain('Engines Ltd');
    expect(html).toContain('<li>Wrote the first program</li>');
    expect(html).toContain('@page { size: A4; margin: 16mm; }');
  });

  it('has no scripts and blocks external loads', () => {
    const html = renderResumeHtml(sample());
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("default-src 'none'");
  });

  it('escapes user content', () => {
    const content = updateBasics(sample(), {
      fullName: '<script>alert(1)</script>',
      website: 'javascript:alert(1)',
    });
    const html = renderResumeHtml({ ...content, title: '</title><script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript:');
  });

  it('supports US Letter', () => {
    expect(renderResumeHtml(sample(), { pageSize: 'Letter' })).toContain('size: Letter');
  });
});

describe('registry', () => {
  it('knows the classic template and falls back to the default', () => {
    expect(isTemplateId('classic')).toBe(true);
    expect(isTemplateId('nope')).toBe(false);
    expect(getTemplate('nope').id).toBe(DEFAULT_TEMPLATE_ID);
  });
});
