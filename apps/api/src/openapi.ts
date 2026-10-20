import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_COOKIE } from './auth/auth.constants.js';

export const OPENAPI_PATH = 'api/docs';

/** Swagger UI at /api/docs and the JSON at /api/docs-json. Not served in production. */
export function setupOpenApi(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Pypr API')
    .setDescription(
      'Sign in through /api/auth to get the session cookies. Requests that change data need an ' +
        'allowed Origin header.',
    )
    .setVersion('1')
    .addCookieAuth(ACCESS_COOKIE)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(OPENAPI_PATH, app, document, { jsonDocumentUrl: `${OPENAPI_PATH}-json` });
}
