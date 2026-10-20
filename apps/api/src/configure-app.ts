import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { originCheck } from './common/origin-check.js';
import type { Env } from './config/env.js';
import { setupOpenApi } from './openapi.js';

export const API_PREFIX = 'api';

/**
 * App-wide HTTP setup shared by the server entry point and the tests,
 * so tests exercise the same prefix, headers and checks as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter(app.getHttpAdapter()));
  app.use(helmet());
  app.use(cookieParser());
  app.use(originCheck(config.get('WEB_ORIGINS', { infer: true })));
  // A full resume can exceed the default 100 kB.
  app.useBodyParser('json', { limit: '1mb' });
  if (config.get('NODE_ENV', { infer: true }) !== 'production') setupOpenApi(app);
}
