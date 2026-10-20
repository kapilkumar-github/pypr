import type { ParsedResume } from './parsed-resume.js';

export interface ResumeParserInput {
  /** Plain text extracted from the uploaded document. */
  text: string;
}

/**
 * Port for turning resume text into structured data (decision D13). The import workflow depends
 * only on this; provider request formats stay inside the adapters. Implementations must return
 * output that passed `parsedResumeSchema`, or throw ResumeParserError.
 */
export abstract class ResumeParser {
  abstract parse(input: ResumeParserInput): Promise<ParsedResume>;
}

export type ResumeParserErrorKind =
  | 'not_configured' // no provider or credentials
  | 'rate_limited' // provider asked us to slow down
  | 'timeout'
  | 'unavailable' // provider error, outage or out of credits
  | 'invalid_output'; // response wasn't valid JSON for the schema

/** Never includes the resume text. */
export class ResumeParserError extends Error {
  override readonly name = 'ResumeParserError';
  constructor(
    readonly kind: ResumeParserErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
