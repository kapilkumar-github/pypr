import { ResumeParser, ResumeParserError } from './resume-parser.js';
import type { ParsedResume } from './parsed-resume.js';

/** Adapter used when no provider is configured: every import is refused clearly. */
export class DisabledResumeParser extends ResumeParser {
  parse(): Promise<ParsedResume> {
    return Promise.reject(
      new ResumeParserError('not_configured', 'Resume import is not configured on this server'),
    );
  }
}
