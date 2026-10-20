import {
  DEFAULT_RESUME_SETTINGS,
  createResumeContent,
  updateBasics,
  updateSettings,
} from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { contrastRatio, ensureContrast, readableTextOn } from './color.js';
import { renderResumeHtml } from './render.js';
import { settingsCss } from './settings.js';

describe('color helpers', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#B7FF3C', '#FFFFFF')).toBeLessThan(1.5);
  });

  it('darkens a neon accent until it reads on white, keeping readable ones as they are', () => {
    const text = ensureContrast('#B7FF3C', '#FFFFFF', 4.5);
    expect(contrastRatio(text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#1D4ED8', '#FFFFFF', 4.5)).toBe('#1D4ED8');
  });

  it('lightens a dark accent until it shows on a dark background', () => {
    const ring = ensureContrast('#1E1B4B', '#11151D', 3);
    expect(contrastRatio(ring, '#11151D')).toBeGreaterThanOrEqual(3);
  });

  it('picks dark text on light accents and white on dark ones', () => {
    expect(readableTextOn('#B7FF3C')).toBe('#090B10');
    expect(readableTextOn('#1E1B4B')).toBe('#FFFFFF');
  });
});

describe('settings in the rendered resume', () => {
  const base = updateBasics(createResumeContent({ title: 'CV', template: 'classic' }), {
    fullName: 'Ada',
    summary: 'Led **platform** work.\n- one\n- two',
  });

  it('applies accent, font and density as CSS variables', () => {
    const html = renderResumeHtml(
      updateSettings(base, { accentColor: '#22D3EE', font: 'georgia', density: 'compact' }),
    );
    expect(html).toContain('--resume-accent: #22D3EE');
    expect(html).toContain('--resume-font: Georgia');
    expect(html).toContain('--resume-line-height: 1.3');
  });

  it('defaults to neon lime, Helvetica and normal density', () => {
    expect(settingsCss(DEFAULT_RESUME_SETTINGS)).toContain('--resume-accent: #B7FF3C');
    expect(settingsCss(DEFAULT_RESUME_SETTINGS)).toContain('--resume-line-height: 1.45');
  });

  it('renders rich text as safe elements', () => {
    const html = renderResumeHtml(
      updateBasics(base, { summary: '**Bold** <script>x</script>\n1. first' }),
    );
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<ol><li>first</li></ol>');
    expect(html).not.toContain('<script>');
  });
});
