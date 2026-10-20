import type { ResumeContent } from '@pypr/resume-core';

/**
 * File name for a downloaded resume, from the person's name or the resume title. `ascii` is
 * the plain fallback for old clients; `utf8` is percent-encoded for filename*.
 */
// Path separators, quotes and control characters (which would break the Content-Disposition
// header) are replaced with spaces.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function pdfFileName(content: ResumeContent): { ascii: string; utf8: string } {
  const base = content.basics.fullName.trim() || content.title.trim() || 'Resume';
  const cleaned = base.replace(UNSAFE_CHARACTERS, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const name = `${cleaned || 'Resume'} - Resume.pdf`;
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    ascii: ascii === '- Resume.pdf' || !ascii ? 'Resume.pdf' : ascii,
    utf8: encodeURIComponent(name),
  };
}
