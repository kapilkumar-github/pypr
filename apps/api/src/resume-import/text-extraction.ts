import mammoth from 'mammoth';
import { extractText as extractPdfText } from 'unpdf';
import type { DocumentKind } from './upload.js';

/** Longest text sent for parsing (a few pages of resume is ~5–15k characters). */
export const MAX_TEXT_LENGTH = 60_000;
/** Less than this is treated as "no text" (e.g. a scanned PDF). */
export const MIN_TEXT_LENGTH = 80;

/** Plain text of a PDF or DOCX, read from memory. Nothing touches the disk. */
export async function extractDocumentText(kind: DocumentKind, buffer: Buffer): Promise<string> {
  if (kind === 'pdf') {
    const { text } = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    return text;
  }
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Tidies extracted text without losing structure: unified line endings, no control characters,
 * trailing spaces trimmed, at most one blank line in a row, and a length cap.
 */
export function normalizeText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- removing control characters on purpose
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_TEXT_LENGTH)
  );
}

/** Letters and digits only, to judge whether there's real text (not just page numbers). */
export function meaningfulLength(text: string): number {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length;
}
