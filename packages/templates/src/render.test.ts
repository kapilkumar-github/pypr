import {
  addEntry,
  addSection,
  createResumeContent,
  updateBasics,
  updateEntryData,
} from '@pypr/resume-core';
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
    let content = addSection(
      updateBasics(sample(), { fullName: '<script>alert(1)</script>' }),
      'links',
    );
    const links = content.sections.at(-1)?.id ?? '';
    content = addEntry(content, links);
    const entry = content.sections.at(-1)?.entries[0]?.id ?? '';
    content = updateEntryData<'links'>(content, links, entry, {
      label: 'Site',
      url: 'javascript:alert(1)',
    });
    const html = renderResumeHtml({ ...content, title: '</title><script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript:');
  });

  it('renders website and profile links as real links with their address printed', () => {
    let content = addSection(sample(), 'links');
    const links = content.sections.at(-1)?.id ?? '';
    content = addEntry(content, links);
    const entry = content.sections.at(-1)?.entries[0]?.id ?? '';
    content = updateEntryData<'links'>(content, links, entry, {
      label: 'Portfolio',
      url: 'www.ada.dev',
    });
    const html = renderResumeHtml(content);
    expect(html).toContain('Websites &amp; Profiles');
    expect(html).toContain(
      '<a href="https://www.ada.dev/">Portfolio <span class="link-address">ada.dev</span></a>',
    );
  });

  it('shows a photo given as an inline image, and nothing for other sources', () => {
    const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const html = renderResumeHtml(sample(), { photo });
    expect(html).toContain(`<img class="photo" src="${photo}" alt=""/>`);
    expect(html).toContain('masthead masthead-photo');

    for (const unsafe of [
      'https://example.com/me.jpg',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/jpeg;base64,abc" onerror="x',
    ]) {
      const other = renderResumeHtml(sample(), { photo: unsafe });
      expect(other).not.toContain('<img');
    }
    expect(renderResumeHtml(sample())).not.toContain('<img');
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
