import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_TEMPLATE_ID } from '@pypr/templates';
import { RESUME_IMPORT_ERROR_CODES, type ResumeImportResponse } from '@pypr/validation';
import { ResumeParser, ResumeParserError } from '../integrations/resume-parser/resume-parser.js';
import { importError } from './import-errors.js';
import { EmptyImportError, toResumeContent } from './normalize.js';
import {
  MIN_TEXT_LENGTH,
  extractDocumentText,
  meaningfulLength,
  normalizeText,
} from './text-extraction.js';
import { detectDocumentKind, type UploadedDocument } from './upload.js';

const { noText, unparseable, busy, unavailable } = RESUME_IMPORT_ERROR_CODES;

/**
 * Upload -> text -> AI parser -> validated resume content (decision D22). Stateless: the file
 * lives only in this request's memory and nothing is written to the database. The user
 * reviews the result and creates the resume through the normal create endpoint.
 */
@Injectable()
export class ResumeImportService {
  private readonly logger = new Logger(ResumeImportService.name);

  constructor(private readonly parser: ResumeParser) {}

  async parse(file: UploadedDocument | undefined): Promise<ResumeImportResponse> {
    const kind = detectDocumentKind(file);
    const buffer = file?.buffer ?? Buffer.alloc(0);

    let text: string;
    try {
      text = normalizeText(await extractDocumentText(kind, buffer));
    } catch (error) {
      this.logger.warn(
        `Text extraction failed for a ${kind}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw importError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        noText,
        "We couldn't read this file. It may be damaged or password-protected. Try exporting it again as PDF or DOCX.",
      );
    }
    if (meaningfulLength(text) < MIN_TEXT_LENGTH) {
      throw importError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        noText,
        kind === 'pdf'
          ? 'This PDF has no selectable text, so it is probably a scan or an image. Export your resume as a text-based PDF or a DOCX and try again.'
          : 'This document has almost no text. Check that it is the right file.',
      );
    }

    let parsed;
    try {
      parsed = await this.parser.parse({ text });
    } catch (error) {
      throw this.toHttp(error);
    }

    try {
      return toResumeContent(parsed, {
        title: 'Imported resume',
        template: DEFAULT_TEMPLATE_ID,
      });
    } catch (error) {
      this.logger.warn(
        `Normalization rejected the parsed resume: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw importError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        unparseable,
        error instanceof EmptyImportError
          ? "We couldn't find resume content in this file."
          : "We couldn't turn this file into a resume. Try another file, or create the resume by hand.",
      );
    }
  }

  private toHttp(error: unknown) {
    if (!(error instanceof ResumeParserError)) {
      this.logger.error(
        `Resume parser failed unexpectedly: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return importError(
        HttpStatus.SERVICE_UNAVAILABLE,
        unavailable,
        'Import is unavailable right now. Please try again later.',
      );
    }
    this.logger.warn(`Resume parser error (${error.kind}): ${error.message}`);
    switch (error.kind) {
      case 'rate_limited':
      case 'timeout':
        return importError(
          HttpStatus.SERVICE_UNAVAILABLE,
          busy,
          'The import service is busy. Please try again in a minute.',
        );
      case 'invalid_output':
        return importError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          unparseable,
          "We couldn't turn this file into a resume. Try again, or create the resume by hand.",
        );
      case 'not_configured':
      case 'unavailable':
        return importError(
          HttpStatus.SERVICE_UNAVAILABLE,
          unavailable,
          'Import is unavailable right now. Please try again later.',
        );
    }
  }
}
