import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { DisabledResumeParser } from './disabled-resume-parser.js';
import { OpenRouterResumeParser } from './openrouter-resume-parser.js';
import { ResumeParser } from './resume-parser.js';

/** Picks the resume-parser adapter from RESUME_PARSER_PROVIDER. */
@Global()
@Module({
  providers: [
    {
      provide: ResumeParser,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ResumeParser => {
        const parser = config.get('RESUME_PARSER', { infer: true });
        return parser.provider === 'openrouter'
          ? new OpenRouterResumeParser({
              apiKey: parser.apiKey,
              model: parser.model,
              timeoutMs: parser.timeoutMs,
              endpoint: `${parser.baseUrl}/chat/completions`,
            })
          : new DisabledResumeParser();
      },
    },
  ],
  exports: [ResumeParser],
})
export class ResumeParserModule {}
