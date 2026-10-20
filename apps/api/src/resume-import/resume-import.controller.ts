import {
  Controller,
  HttpCode,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  RESUME_IMPORT_MAX_BYTES,
  resumeImportResponseSchema,
  type ResumeImportResponse,
} from '@pypr/validation';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { apiSchema } from '../common/openapi-schema.js';
import { ResumeImportService } from './resume-import.service.js';
import type { UploadedDocument } from './upload.js';

@ApiTags('resumes')
@ApiCookieAuth(ACCESS_COOKIE)
@Controller('resume-imports')
export class ResumeImportController {
  constructor(private readonly imports: ResumeImportService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  // No `dest` or `storage`: multer keeps the file in memory only. It's never written to disk
  // and is gone when the request ends.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: RESUME_IMPORT_MAX_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  @ApiOperation({
    summary:
      'Parse a PDF or DOCX resume into resume content (not saved; review, then POST /api/resumes)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, schema: apiSchema(resumeImportResponseSchema) })
  @ApiResponse({ status: 413, description: 'Larger than 5 MB' })
  @ApiResponse({ status: 415, description: 'Not a PDF or DOCX (UNSUPPORTED_FILE)' })
  @ApiResponse({
    status: 422,
    description: 'No readable text (NO_TEXT_FOUND) or no resume found (UNPARSEABLE_RESUME)',
  })
  @ApiResponse({
    status: 503,
    description: 'Parser busy (PARSER_BUSY) or unavailable (PARSER_UNAVAILABLE)',
  })
  parse(@UploadedFile() file: UploadedDocument | undefined): Promise<ResumeImportResponse> {
    return this.imports.parse(file);
  }
}
