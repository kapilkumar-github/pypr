import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  RESUME_PHOTO_MAX_BYTES,
  resumePhotoResponseSchema,
  type ResumePhotoResponse,
} from '@pypr/validation';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import type { AccessClaims } from '../auth/tokens.service.js';
import { apiSchema } from '../common/openapi-schema.js';
import type { UploadedImage } from './photo-image.js';
import { ResumePhotosService } from './resume-photos.service.js';

const idParam = new ParseUUIDPipe();

@ApiTags('resumes')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 404, description: "Missing, or someone else's resume" })
@Controller('resumes/:id/photo')
export class ResumePhotosController {
  constructor(private readonly photos: ResumePhotosService) {}

  @Put()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  // Kept in memory only (no `dest`/`storage`); only the re-encoded image is stored.
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: RESUME_PHOTO_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({ summary: "Set or replace the resume's profile photo (JPEG, PNG or WebP)" })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
      required: ['photo'],
    },
  })
  @ApiResponse({ status: 200, schema: apiSchema(resumePhotoResponseSchema) })
  @ApiResponse({ status: 413, description: 'Larger than 5 MB' })
  @ApiResponse({ status: 415, description: 'Not a readable JPEG, PNG or WebP (UNSUPPORTED_IMAGE)' })
  @ApiResponse({ status: 422, description: 'Smaller than 64 px on a side (UNSUPPORTED_IMAGE)' })
  async put(
    @CurrentAuth() auth: AccessClaims,
    @Param('id', idParam) id: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<ResumePhotoResponse> {
    return { photo: await this.photos.put(auth.userId, id, file) };
  }

  @Get()
  // Only the owner may see it, so no shared caches; the browser revalidates every time.
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: "The resume's profile photo" })
  @ApiProduces('image/jpeg')
  @ApiResponse({ status: 200, description: 'The image' })
  async get(
    @CurrentAuth() auth: AccessClaims,
    @Param('id', idParam) id: string,
  ): Promise<StreamableFile> {
    const photo = await this.photos.get(auth.userId, id);
    return new StreamableFile(photo.data, {
      type: photo.contentType,
      length: photo.data.length,
      disposition: 'inline',
    });
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the resume's profile photo" })
  @ApiResponse({ status: 204 })
  async delete(@CurrentAuth() auth: AccessClaims, @Param('id', idParam) id: string): Promise<void> {
    await this.photos.delete(auth.userId, id);
  }
}
