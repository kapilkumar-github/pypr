import { resumeContentSchema, templateIdSchema } from '@pypr/resume-core';
import { z } from 'zod';

/** Header that makes POST /api/resumes safe to retry (decision D3). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const resumeIdSchema = z.uuid();

/**
 * POST /api/resumes. Without `content` the resume starts with the starter sections; with it
 * (an import the user confirmed) that content is saved as is. The template defaults to the
 * first one available.
 */
export const createResumeRequestSchema = z.strictObject({
  title: z.string().trim().min(1, 'Give the resume a name.').max(120),
  template: templateIdSchema.optional(),
  content: resumeContentSchema.optional(),
});
export type CreateResumeRequest = z.infer<typeof createResumeRequestSchema>;

/** PUT /api/resumes/:id: the whole content plus the revision it was based on. */
export const saveResumeRequestSchema = z.strictObject({
  revision: z.int().positive(),
  content: resumeContentSchema,
});
export type SaveResumeRequest = z.infer<typeof saveResumeRequestSchema>;

/**
 * A resume's profile photo (decision D28): stored apart from the content, fetched from
 * GET /api/resumes/:id/photo. `updatedAt` changes whenever the photo is replaced.
 */
export const resumePhotoSchema = z.object({
  updatedAt: z.iso.datetime(),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type ResumePhoto = z.infer<typeof resumePhotoSchema>;

export const resumeDocumentSchema = z.object({
  id: resumeIdSchema,
  revision: z.int().positive(),
  schemaVersion: z.int().positive(),
  updatedAt: z.iso.datetime(),
  content: resumeContentSchema,
  /** Null when the resume has no photo. */
  photo: resumePhotoSchema.nullable(),
});
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;

export const resumeSummarySchema = z.object({
  id: resumeIdSchema,
  title: z.string(),
  template: z.string(),
  /** From the resume's personal details; "" when not filled in. */
  headline: z.string(),
  revision: z.int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ResumeSummary = z.infer<typeof resumeSummarySchema>;

export const resumeListResponseSchema = z.object({ resumes: z.array(resumeSummarySchema) });
export type ResumeListResponse = z.infer<typeof resumeListResponseSchema>;

export const RESUME_ERROR_CODES = {
  /** The resume was saved elsewhere since this revision; reload before saving. */
  revisionConflict: 'REVISION_CONFLICT',
} as const;

/** Body of a 409 from PUT /api/resumes/:id. */
export const revisionConflictResponseSchema = z.object({
  statusCode: z.literal(409),
  code: z.literal(RESUME_ERROR_CODES.revisionConflict),
  message: z.string(),
  currentRevision: z.int().positive(),
});
export type RevisionConflictResponse = z.infer<typeof revisionConflictResponseSchema>;

/** Response of PUT /api/resumes/:id/photo. */
export const resumePhotoResponseSchema = z.object({ photo: resumePhotoSchema });
export type ResumePhotoResponse = z.infer<typeof resumePhotoResponseSchema>;

/** Upload limit for PUT /api/resumes/:id/photo (the stored, re-encoded image is far smaller). */
export const RESUME_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Image types a photo upload may be; the API checks the bytes, not the name or MIME type. */
export const RESUME_PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const RESUME_PHOTO_ERROR_CODES = {
  /** Not a JPEG, PNG or WebP image, unreadable, or too small. */
  unsupportedImage: 'UNSUPPORTED_IMAGE',
} as const;

/** Upload limit for POST /api/resume-imports. */
export const RESUME_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_IMPORT_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const;

/**
 * Response of POST /api/resume-imports: the parsed resume, not saved yet. The user reviews it
 * and creates the resume with POST /api/resumes { title, content }.
 */
export const resumeImportResponseSchema = z.object({
  content: resumeContentSchema,
  /** Things the user should check, e.g. "No work experience was found". */
  warnings: z.array(z.string()),
});
export type ResumeImportResponse = z.infer<typeof resumeImportResponseSchema>;

export const RESUME_IMPORT_ERROR_CODES = {
  /** Not a PDF or DOCX, or too large. */
  unsupportedFile: 'UNSUPPORTED_FILE',
  /** No usable text (e.g. a scanned PDF without OCR). */
  noText: 'NO_TEXT_FOUND',
  /** The AI couldn't produce a valid resume from the text. */
  unparseable: 'UNPARSEABLE_RESUME',
  /** The AI provider is busy or rate-limited; try again shortly. */
  busy: 'PARSER_BUSY',
  /** The AI provider failed or isn't configured. */
  unavailable: 'PARSER_UNAVAILABLE',
} as const;
