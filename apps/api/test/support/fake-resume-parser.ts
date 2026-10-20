import type { ParsedResume } from '../../src/integrations/resume-parser/parsed-resume.js';
import {
  ResumeParser,
  type ResumeParserInput,
} from '../../src/integrations/resume-parser/resume-parser.js';
import { sampleParsedResume } from './parsed-resume-factory.js';

/** Test adapter: records the text it was given and returns a canned result (or throws). */
export class FakeResumeParser extends ResumeParser {
  readonly inputs: ResumeParserInput[] = [];
  next: ParsedResume | Error = sampleParsedResume();

  parse(input: ResumeParserInput): Promise<ParsedResume> {
    this.inputs.push(input);
    const result = this.next;
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  }
}
