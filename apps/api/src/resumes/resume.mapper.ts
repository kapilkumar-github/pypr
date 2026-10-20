import {
  DEFAULT_RESUME_SETTINGS,
  RESUME_FONTS,
  RESUME_SCHEMA_VERSION,
  emptyBasics,
  upgradeResumeContent,
  type Basics,
  type ResumeContent,
} from '@pypr/resume-core';
import type { ResumeDocument, ResumeSummary } from '@pypr/validation';
import type { Prisma } from '../generated/prisma/client.js';

/** Relations needed to rebuild a resume's content, in display order. */
export const RESUME_CONTENT_INCLUDE = {
  basics: true,
  sections: {
    orderBy: { position: 'asc' },
    include: { entries: { orderBy: { position: 'asc' } } },
  },
  // Only whether there is a photo; its bytes are served by GET /api/resumes/:id/photo.
  photo: { select: { updatedAt: true, width: true, height: true } },
} satisfies Prisma.ResumeInclude;

export type ResumeWithContent = Prisma.ResumeGetPayload<{ include: typeof RESUME_CONTENT_INCLUDE }>;

/**
 * Basics as stored at `schemaVersion`. Before version 3 they include the legacy website,
 * LinkedIn and GitHub columns, which the version 3 upgrade moves into a links section.
 */
export function basicsOf(
  row: ResumeWithContent['basics'],
  schemaVersion: number = RESUME_SCHEMA_VERSION,
): Basics | (Basics & LegacyLinkColumns) {
  if (!row) return emptyBasics();
  const { resumeId: _, website, linkedin, github, ...basics } = row;
  return schemaVersion < 3 ? { ...basics, website, linkedin, github } : basics;
}

interface LegacyLinkColumns {
  website: string;
  linkedin: string;
  github: string;
}

/** Saves write blanks to the legacy columns: their values live in the links section now. */
export const BLANK_LEGACY_LINKS: LegacyLinkColumns = { website: '', linkedin: '', github: '' };

/** Rows -> validated document, upgrading content stored by an older schema version. */
export function toResumeDocument(row: ResumeWithContent): ResumeDocument {
  const stored = {
    title: row.title,
    template: row.template,
    // A font id no longer offered falls back to the default instead of failing to load.
    settings: {
      accentColor: row.accentColor,
      font: (RESUME_FONTS as readonly string[]).includes(row.font)
        ? row.font
        : DEFAULT_RESUME_SETTINGS.font,
      density: row.density,
    },
    basics: basicsOf(row.basics, row.schemaVersion),
    sections: row.sections.map((section) => ({
      id: section.id,
      type: section.type,
      title: section.title,
      visible: section.visible,
      entries: section.entries.map((entry) => ({
        id: entry.id,
        visible: entry.visible,
        data: entry.data,
      })),
    })),
  };
  const content: ResumeContent = upgradeResumeContent(stored, row.schemaVersion);
  return {
    id: row.id,
    revision: row.revision,
    schemaVersion: RESUME_SCHEMA_VERSION,
    updatedAt: row.updatedAt.toISOString(),
    content,
    photo: row.photo
      ? {
          updatedAt: row.photo.updatedAt.toISOString(),
          width: row.photo.width,
          height: row.photo.height,
        }
      : null,
  };
}

export function toResumeSummary(row: {
  id: string;
  title: string;
  template: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  basics: { headline: string } | null;
}): ResumeSummary {
  return {
    id: row.id,
    title: row.title,
    template: row.template,
    headline: row.basics?.headline ?? '',
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
