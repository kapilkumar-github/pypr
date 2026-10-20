import { HttpStatus } from '@nestjs/common';
import { RESUME_IMPORT_ERROR_CODES, RESUME_IMPORT_MAX_BYTES } from '@pypr/validation';
import { importError } from './import-errors.js';

export type DocumentKind = 'pdf' | 'docx';

export interface UploadedDocument {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const unsupported = () =>
  importError(
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    RESUME_IMPORT_ERROR_CODES.unsupportedFile,
    'Upload a PDF or Word (.docx) file.',
  );

/**
 * Decides the document type from its bytes, not its name or the browser's MIME type:
 * PDFs start with "%PDF-", DOCX files are ZIP archives containing word/document.xml.
 */
export function detectDocumentKind(file: UploadedDocument | undefined): DocumentKind {
  if (!file || file.size === 0) throw unsupported();
  if (file.size > RESUME_IMPORT_MAX_BYTES) {
    throw importError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      RESUME_IMPORT_ERROR_CODES.unsupportedFile,
      'The file is larger than 5 MB.',
    );
  }
  const head = file.buffer.subarray(0, 5).toString('latin1');
  const name = file.originalname.toLowerCase();
  if (head === '%PDF-' && name.endsWith('.pdf')) return 'pdf';
  const isZip = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03;
  if (isZip && name.endsWith('.docx') && file.buffer.includes('word/document.xml')) return 'docx';
  throw unsupported();
}
