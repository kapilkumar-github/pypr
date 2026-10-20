import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../database/prisma.service.js';

export interface HealthResponse {
  status: 'ok';
  database: 'ok';
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Readiness check: the API is up and can query the database. */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(`Database check failed: ${describeError(error)}`);
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok' };
  }
}

/**
 * One-line reason for the log. Prisma's message for a refused connection is just
 * "Invalid `prisma.$queryRaw()` invocation:"; the useful part is `code` (e.g. ECONNREFUSED).
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  const message = error.message.replace(/\s+/g, ' ').trim();
  return [error.name, typeof code === 'string' ? code : undefined, message]
    .filter(Boolean)
    .join(': ');
}
