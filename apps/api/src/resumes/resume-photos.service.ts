import { Injectable, NotFoundException } from '@nestjs/common';
import type { ResumePhoto } from '@pypr/validation';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { processPhoto, type UploadedImage } from './photo-image.js';

export interface StoredPhoto {
  contentType: string;
  data: Buffer;
  updatedAt: Date;
}

const notFound = () => new NotFoundException('Resume not found');

/**
 * Profile photos (decision D28). One per resume, scoped by owner like the resumes themselves.
 * Changing the photo touches the resume's updatedAt but not its revision, so it never conflicts
 * with an autosave in flight.
 */
@Injectable()
export class ResumePhotosService {
  constructor(private readonly prisma: PrismaService) {}

  async put(
    userId: string,
    resumeId: string,
    file: UploadedImage | undefined,
  ): Promise<ResumePhoto> {
    // Ownership first: other people's resumes are 404 before any image is decoded.
    await this.assertOwned(userId, resumeId);
    const image = await processPhoto(file);
    const data = new Uint8Array(image.data);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const photo = await tx.resumePhoto.upsert({
          where: { resumeId },
          create: { resumeId, contentType: image.contentType, data, ...size(image) },
          update: { contentType: image.contentType, data, ...size(image) },
          select: { updatedAt: true, width: true, height: true },
        });
        await tx.resume.update({ where: { id: resumeId }, data: { updatedAt: new Date() } });
        return photo;
      });
      return { updatedAt: row.updatedAt.toISOString(), width: row.width, height: row.height };
    } catch (error) {
      // The resume was deleted while the image was being processed.
      if (isMissingRow(error)) throw notFound();
      throw error;
    }
  }

  async get(userId: string, resumeId: string): Promise<StoredPhoto> {
    const row = await this.prisma.resumePhoto.findFirst({
      where: { resumeId, resume: { userId } },
      select: { contentType: true, data: true, updatedAt: true },
    });
    if (!row) throw new NotFoundException('This resume has no photo');
    return { contentType: row.contentType, data: Buffer.from(row.data), updatedAt: row.updatedAt };
  }

  /** Removing a photo that isn't there is fine (a retried request). */
  async delete(userId: string, resumeId: string): Promise<void> {
    await this.assertOwned(userId, resumeId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.resumePhoto.deleteMany({ where: { resumeId } });
      if (count > 0) {
        await tx.resume.updateMany({ where: { id: resumeId }, data: { updatedAt: new Date() } });
      }
    });
  }

  /** The photo as an inline image for rendering (the PDF has no network access), if any. */
  async dataUri(userId: string, resumeId: string): Promise<string | undefined> {
    const row = await this.prisma.resumePhoto.findFirst({
      where: { resumeId, resume: { userId } },
      select: { contentType: true, data: true },
    });
    return row
      ? `data:${row.contentType};base64,${Buffer.from(row.data).toString('base64')}`
      : undefined;
  }

  private async assertOwned(userId: string, resumeId: string): Promise<void> {
    const owned = await this.prisma.resume.count({ where: { id: resumeId, userId } });
    if (owned === 0) throw notFound();
  }
}

function size(image: { width: number; height: number }) {
  return { width: image.width, height: image.height };
}

function isMissingRow(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2003' || error.code === 'P2025')
  );
}
