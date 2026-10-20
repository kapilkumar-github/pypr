import { Catch, HttpException, Logger, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Unexpected errors: log a summary that can't contain request data, answer a generic 500.
 * HTTP errors (4xx, deliberate 5xx) keep Nest's normal handling.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('UnhandledError');

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException || isHttpError(exception)) {
      super.catch(exception, host);
      return;
    }
    this.logger.error(describeForLog(exception));
    const res = host.switchToHttp().getResponse<Response>();
    if (!res.headersSent) {
      res.status(500).json({ statusCode: 500, message: 'Internal server error' });
    }
  }
}

/** Errors from Express middleware (e.g. body-parser's 413) carry their own HTTP status. */
function isHttpError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * One safe line per error. Prisma validation errors are reduced to their name: their message
 * repeats the query arguments, which can include emails or password hashes (decision D4).
 */
export function describeForLog(error: unknown): string {
  if (error instanceof Prisma.PrismaClientValidationError) {
    return 'PrismaClientValidationError (details omitted; they can contain request data)';
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `PrismaClientKnownRequestError ${error.code}`;
  }
  if (error instanceof Error) {
    const frames = (error.stack ?? '').split('\n').filter((line) => line.trim().startsWith('at '));
    return [`${error.name}: ${error.message.slice(0, 300)}`, ...frames.slice(0, 8)].join('\n');
  }
  return 'Non-error value thrown';
}
