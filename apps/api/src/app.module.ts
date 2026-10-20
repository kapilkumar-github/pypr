import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { EmailModule } from './integrations/email/email.module.js';
import { PdfModule } from './integrations/pdf/pdf.module.js';
import { ResumeParserModule } from './integrations/resume-parser/resume-parser.module.js';
import { ResumeImportModule } from './resume-import/resume-import.module.js';
import { ResumesModule } from './resumes/resumes.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Tests get their whole config from vitest.config.ts, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    // Rate limits per client IP, in memory (one API instance). Routes opt in with ThrottlerGuard:
    // auth routes and PDF export. 10 per minute unless a route says otherwise.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }] }),
    DatabaseModule,
    EmailModule,
    PdfModule,
    ResumeParserModule,
    AuthModule,
    HealthModule,
    ResumesModule,
    ResumeImportModule,
  ],
})
export class AppModule {}
