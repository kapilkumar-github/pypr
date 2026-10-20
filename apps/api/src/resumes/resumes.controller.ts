import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IDEMPOTENCY_KEY_HEADER,
  createResumeRequestSchema,
  resumeDocumentSchema,
  resumeListResponseSchema,
  revisionConflictResponseSchema,
  saveResumeRequestSchema,
  type CreateResumeRequest,
  type ResumeDocument,
  type ResumeListResponse,
  type SaveResumeRequest,
} from '@pypr/validation';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { renderResumeHtml } from '@pypr/templates';
import type { Response } from 'express';
import { z } from 'zod';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import type { AccessClaims } from '../auth/tokens.service.js';
import { apiSchema } from '../common/openapi-schema.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { PdfRenderer } from '../integrations/pdf/pdf-renderer.js';
import { pdfFileName } from './pdf-file-name.js';
import { ResumePhotosService } from './resume-photos.service.js';
import { ResumesService } from './resumes.service.js';

const idParam = new ParseUUIDPipe();
const idempotencyKeySchema = z.uuid();
const pageSizeSchema = z.enum(['A4', 'Letter']).default('A4');

@ApiTags('resumes')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiResponse({ status: 401, description: 'Not signed in' })
@Controller('resumes')
export class ResumesController {
  private readonly logger = new Logger(ResumesController.name);

  constructor(
    private readonly resumes: ResumesService,
    private readonly photos: ResumePhotosService,
    private readonly pdf: PdfRenderer,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the signed-in user's resumes, most recently edited first" })
  @ApiResponse({ status: 200, schema: apiSchema(resumeListResponseSchema) })
  async list(@CurrentAuth() auth: AccessClaims): Promise<ResumeListResponse> {
    return { resumes: await this.resumes.list(auth.userId) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a resume with the starter sections' })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: 'A UUID. Retrying with the same key returns the first result (200).',
  })
  @ApiBody({ schema: apiSchema(createResumeRequestSchema, 'input') })
  @ApiResponse({ status: 201, schema: apiSchema(resumeDocumentSchema) })
  @ApiResponse({ status: 200, description: 'Already created with this key' })
  async create(
    @CurrentAuth() auth: AccessClaims,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body(new ZodBodyPipe(createResumeRequestSchema)) body: CreateResumeRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResumeDocument> {
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new BadRequestException(`The ${IDEMPOTENCY_KEY_HEADER} header must be a UUID`);
    }
    const { document, created } = await this.resumes.create(auth.userId, body, key.data);
    res.status(created ? 201 : 200);
    return document;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a resume' })
  @ApiResponse({ status: 200, schema: apiSchema(resumeDocumentSchema) })
  @ApiResponse({ status: 404, description: "Missing, or someone else's" })
  get(
    @CurrentAuth() auth: AccessClaims,
    @Param('id', idParam) id: string,
  ): Promise<ResumeDocument> {
    return this.resumes.get(auth.userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Save the whole resume (autosave)' })
  @ApiBody({ schema: apiSchema(saveResumeRequestSchema, 'input') })
  @ApiResponse({ status: 200, schema: apiSchema(resumeDocumentSchema) })
  @ApiResponse({ status: 409, schema: apiSchema(revisionConflictResponseSchema) })
  save(
    @CurrentAuth() auth: AccessClaims,
    @Param('id', idParam) id: string,
    @Body(new ZodBodyPipe(saveResumeRequestSchema)) body: SaveResumeRequest,
  ): Promise<ResumeDocument> {
    return this.resumes.save(auth.userId, id, body);
  }

  @Get(':id/pdf')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Download the resume as a PDF (same template as the preview)' })
  @ApiQuery({ name: 'pageSize', required: false, enum: ['A4', 'Letter'] })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The PDF file' })
  @ApiResponse({ status: 503, description: 'The PDF could not be created right now' })
  async downloadPdf(
    @CurrentAuth() auth: AccessClaims,
    @Param('id', idParam) id: string,
    @Query('pageSize') pageSizeParam: string | undefined,
  ): Promise<StreamableFile> {
    const pageSize = pageSizeSchema.safeParse(pageSizeParam);
    if (!pageSize.success) throw new BadRequestException('pageSize must be A4 or Letter');

    const { content, photo: hasPhoto } = await this.resumes.get(auth.userId, id);
    const photo = hasPhoto ? await this.photos.dataUri(auth.userId, id) : undefined;
    let pdf: Buffer;
    try {
      pdf = await this.pdf.render(renderResumeHtml(content, { pageSize: pageSize.data, photo }));
    } catch (error) {
      this.logger.error(
        `PDF failed for resume ${id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException("We couldn't create the PDF. Please try again.");
    }
    const { ascii, utf8 } = pdfFileName(content);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      length: pdf.length,
      disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a resume' })
  @ApiResponse({ status: 204 })
  async delete(@CurrentAuth() auth: AccessClaims, @Param('id', idParam) id: string): Promise<void> {
    await this.resumes.delete(auth.userId, id);
  }
}
