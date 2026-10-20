import { isDeepStrictEqual } from 'node:util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RESUME_SCHEMA_VERSION, createResumeContent } from '@pypr/resume-core';
import {
  RESUME_ERROR_CODES,
  type CreateResumeRequest,
  type ResumeDocument,
  type ResumeSummary,
  type SaveResumeRequest,
} from '@pypr/validation';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { RESUME_CONTENT_INCLUDE, toResumeDocument, toResumeSummary } from './resume.mapper.js';
import { DEFAULT_TEMPLATE_ID, assertKnownTemplate } from './templates.js';

/** Every query is scoped by owner: another user's resume is simply "not found". */
@Injectable()
export class ResumesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ResumeSummary[]> {
    const rows = await this.prisma.resume.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        template: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
        basics: { select: { headline: true } },
      },
    });
    return rows.map(toResumeSummary);
  }

  async get(userId: string, resumeId: string): Promise<ResumeDocument> {
    const row = await this.prisma.resume.findFirst({
      where: { id: resumeId, userId },
      include: RESUME_CONTENT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Resume not found');
    return toResumeDocument(row);
  }

  /**
   * Creates a resume with the starter sections. Retrying with the same idempotency key returns
   * the resume the first request created instead of a duplicate.
   */
  async create(
    userId: string,
    input: CreateResumeRequest,
    idempotencyKey: string,
  ): Promise<{ document: ResumeDocument; created: boolean }> {
    const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return { document: existing, created: false };

    const template = input.template ?? input.content?.template ?? DEFAULT_TEMPLATE_ID;
    assertKnownTemplate(template);
    // Confirmed import: save the given content; otherwise start with the starter sections.
    const content = input.content
      ? { ...input.content, title: input.title, template }
      : createResumeContent({ title: input.title, template });
    try {
      const row = await this.prisma.resume.create({
        data: {
          userId,
          idempotencyKey,
          title: content.title,
          template: content.template,
          accentColor: content.settings.accentColor,
          font: content.settings.font,
          density: content.settings.density,
          schemaVersion: RESUME_SCHEMA_VERSION,
          basics: { create: content.basics },
          sections: {
            create: content.sections.map((section, position) => ({
              id: section.id,
              type: section.type,
              title: section.title,
              visible: section.visible,
              position,
              entries: {
                create: section.entries.map((entry, entryPosition) => ({
                  id: entry.id,
                  visible: entry.visible,
                  position: entryPosition,
                  data: entry.data,
                })),
              },
            })),
          },
        },
        include: RESUME_CONTENT_INCLUDE,
      });
      return { document: toResumeDocument(row), created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Two concurrent requests with the same key: the loser returns the winner's resume.
        const winner = await this.findByIdempotencyKey(userId, idempotencyKey);
        if (winner) return { document: winner, created: false };
        // Otherwise a section or entry id in the given content is already used elsewhere.
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid request body',
          issues: [{ path: 'content', message: 'A section or entry id is already in use' }],
        });
      }
      throw error;
    }
  }

  /**
   * Replaces the content (decision D3). The revision check and the bump happen in one
   * conditional UPDATE, which also locks the row until the transaction ends, so concurrent
   * saves are serialized and only one can win a given revision. Only changed rows are written.
   */
  async save(userId: string, resumeId: string, input: SaveResumeRequest): Promise<ResumeDocument> {
    const { content } = input;
    assertKnownTemplate(content.template);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.resume.updateMany({
          where: { id: resumeId, userId, revision: input.revision },
          data: {
            revision: { increment: 1 },
            title: content.title,
            template: content.template,
            accentColor: content.settings.accentColor,
            font: content.settings.font,
            density: content.settings.density,
            schemaVersion: RESUME_SCHEMA_VERSION,
          },
        });
        if (count === 0) {
          const current = await tx.resume.findFirst({
            where: { id: resumeId, userId },
            select: { revision: true },
          });
          if (!current) throw new NotFoundException('Resume not found');
          throw new ConflictException({
            statusCode: 409,
            code: RESUME_ERROR_CODES.revisionConflict,
            message: 'This resume was changed somewhere else. Reload to get the latest version.',
            currentRevision: current.revision,
          });
        }

        await tx.resumeBasics.upsert({
          where: { resumeId },
          create: { resumeId, ...content.basics },
          update: content.basics,
        });

        const [existingSections, existingEntries] = await Promise.all([
          tx.resumeSection.findMany({ where: { resumeId } }),
          tx.resumeEntry.findMany({ where: { section: { resumeId } } }),
        ]);
        const sectionsById = new Map(existingSections.map((row) => [row.id, row]));
        const entriesById = new Map(existingEntries.map((row) => [row.id, row]));

        const wantedSections = content.sections.map((section, position) => ({
          id: section.id,
          resumeId,
          type: section.type,
          title: section.title,
          visible: section.visible,
          position,
        }));
        const wantedEntries = content.sections.flatMap((section) =>
          section.entries.map((entry, position) => ({
            id: entry.id,
            sectionId: section.id,
            visible: entry.visible,
            position,
            data: entry.data,
          })),
        );

        // New rows are created with their client ids. An id used by any other resume makes
        // the insert fail on the primary key, so rows can never be taken over (see catch).
        const newSections = wantedSections.filter((s) => !sectionsById.has(s.id));
        if (newSections.length > 0) await tx.resumeSection.createMany({ data: newSections });
        for (const section of wantedSections) {
          const existing = sectionsById.get(section.id);
          if (existing && !isDeepStrictEqual({ ...existing }, section)) {
            await tx.resumeSection.update({ where: { id: section.id }, data: section });
          }
        }

        const newEntries = wantedEntries.filter((e) => !entriesById.has(e.id));
        if (newEntries.length > 0) await tx.resumeEntry.createMany({ data: newEntries });
        for (const entry of wantedEntries) {
          const existing = entriesById.get(entry.id);
          if (existing && !isDeepStrictEqual({ ...existing }, entry)) {
            await tx.resumeEntry.update({ where: { id: entry.id }, data: entry });
          }
        }

        // Deletes last, so entries moved out of a removed section survive.
        const keepEntries = new Set(wantedEntries.map((e) => e.id));
        const keepSections = new Set(wantedSections.map((s) => s.id));
        const removedEntries = existingEntries.filter((e) => !keepEntries.has(e.id));
        const removedSections = existingSections.filter((s) => !keepSections.has(s.id));
        if (removedEntries.length > 0) {
          await tx.resumeEntry.deleteMany({
            where: { id: { in: removedEntries.map((e) => e.id) } },
          });
        }
        if (removedSections.length > 0) {
          await tx.resumeSection.deleteMany({
            where: { id: { in: removedSections.map((s) => s.id) } },
          });
        }

        const saved = await tx.resume.findUniqueOrThrow({
          where: { id: resumeId },
          include: RESUME_CONTENT_INCLUDE,
        });
        return toResumeDocument(saved);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid request body',
          issues: [{ path: 'content', message: 'A section or entry id is already in use' }],
        });
      }
      throw error;
    }
  }

  async delete(userId: string, resumeId: string): Promise<void> {
    const { count } = await this.prisma.resume.deleteMany({ where: { id: resumeId, userId } });
    if (count === 0) throw new NotFoundException('Resume not found');
  }

  private async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<ResumeDocument | null> {
    const row = await this.prisma.resume.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: RESUME_CONTENT_INCLUDE,
    });
    return row ? toResumeDocument(row) : null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
