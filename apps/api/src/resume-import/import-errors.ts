import type { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { RESUME_IMPORT_ERROR_CODES } from '@pypr/validation';

type Code = (typeof RESUME_IMPORT_ERROR_CODES)[keyof typeof RESUME_IMPORT_ERROR_CODES];

/** HTTP error with a machine-readable `code` the import dialog acts on. */
export function importError(status: HttpStatus, code: Code, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}
