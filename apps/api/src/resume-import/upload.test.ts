import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { meaningfulLength, normalizeText } from './text-extraction.js';
import { detectDocumentKind } from './upload.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url));
const file = (originalname: string, buffer: Buffer) => ({
  originalname,
  buffer,
  size: buffer.length,
});

describe('detectDocumentKind', () => {
  it('recognizes PDF and DOCX by their bytes', () => {
    expect(detectDocumentKind(file('cv.pdf', fixture('resume.pdf')))).toBe('pdf');
    expect(detectDocumentKind(file('CV.DOCX', fixture('resume.docx')))).toBe('docx');
  });

  it.each([
    ['a text file named .pdf', file('cv.pdf', Buffer.from('hello world'))],
    ['a PDF named .docx', file('cv.docx', fixture('resume.pdf'))],
    ['a ZIP that is not a Word document', file('cv.docx', Buffer.from('PK\x03\x04 not word'))],
    ['an empty file', file('cv.pdf', Buffer.alloc(0))],
  ])('rejects %s with 415', (_, upload) => {
    expect(() => detectDocumentKind(upload)).toThrow(
      expect.objectContaining({ status: 415 }) as Error,
    );
  });

  it('rejects files over 5 MB with 413', () => {
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]);
    expect(() => detectDocumentKind(file('cv.pdf', big))).toThrow(
      expect.objectContaining({ status: 413 }) as Error,
    );
  });

  it('rejects a missing file', () => {
    expect(() => detectDocumentKind(undefined)).toThrow(
      expect.objectContaining({ status: 415 }) as Error,
    );
  });
});

describe('normalizeText', () => {
  it('keeps line structure but removes noise', () => {
    expect(normalizeText('Name\r\n\r\n\r\n\r\nRole  \t here \u0007\n  bullet')).toBe(
      'Name\n\nRole here\nbullet',
    );
  });

  it('caps the length', () => {
    expect(normalizeText('a'.repeat(100_000))).toHaveLength(60_000);
  });

  it('counts only letters and digits as meaningful', () => {
    expect(meaningfulLength('1\n2\n— · —')).toBe(2);
  });
});
