import { createResumeContent, updateBasics } from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { pdfFileName } from './pdf-file-name.js';

const content = (fullName: string, title = 'CV') =>
  updateBasics(createResumeContent({ title, template: 'classic' }), { fullName });

describe('pdfFileName', () => {
  it('uses the full name', () => {
    expect(pdfFileName(content('Ada Lovelace'))).toEqual({
      ascii: 'Ada Lovelace - Resume.pdf',
      utf8: 'Ada%20Lovelace%20-%20Resume.pdf',
    });
  });

  it('falls back to the title, then to "Resume"', () => {
    expect(pdfFileName(content('', 'Design CV')).ascii).toBe('Design CV - Resume.pdf');
    expect(pdfFileName(content('', '')).ascii).toBe('Resume - Resume.pdf');
  });

  it('strips characters that break headers or paths, and keeps Unicode in utf8', () => {
    const name = pdfFileName(content('Zoë "Z" O/Brien\r\n'));
    expect(name.ascii).toBe('Zoe Z O Brien - Resume.pdf');
    expect(decodeURIComponent(name.utf8)).toBe(
      'Zoë "Z" O Brien - Resume.pdf'.replace(/"/g, ' ').replace(/\s+/g, ' '),
    );
  });
});
