import { createResumeContent } from '@pypr/resume-core';
import { describe, expect, it } from 'vitest';
import { createResumeRequestSchema, saveResumeRequestSchema } from './resumes.js';

describe('createResumeRequestSchema', () => {
  it('trims the title and requires one', () => {
    expect(createResumeRequestSchema.parse({ title: '  CV  ' })).toEqual({ title: 'CV' });
    expect(createResumeRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});

describe('saveResumeRequestSchema', () => {
  const content = createResumeContent({ title: 'CV', template: 'classic' });

  it('needs a positive revision and valid content', () => {
    expect(saveResumeRequestSchema.safeParse({ revision: 1, content }).success).toBe(true);
    expect(saveResumeRequestSchema.safeParse({ revision: 0, content }).success).toBe(false);
    expect(
      saveResumeRequestSchema.safeParse({ revision: 1, content: { ...content, sections: 5 } })
        .success,
    ).toBe(false);
  });
});
