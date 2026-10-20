import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { PdfRenderer } from './pdf-renderer.js';
import { PlaywrightPdfRenderer } from './playwright-pdf-renderer.js';

@Global()
@Module({
  providers: [
    {
      provide: PdfRenderer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PdfRenderer =>
        new PlaywrightPdfRenderer({
          concurrency: config.get('PDF_CONCURRENCY', { infer: true }),
          timeoutMs: config.get('PDF_TIMEOUT_MS', { infer: true }),
        }),
    },
  ],
  exports: [PdfRenderer],
})
export class PdfModule implements OnApplicationShutdown {
  constructor(@Inject(PdfRenderer) private readonly renderer: PdfRenderer) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.renderer instanceof PlaywrightPdfRenderer) await this.renderer.close();
  }
}
