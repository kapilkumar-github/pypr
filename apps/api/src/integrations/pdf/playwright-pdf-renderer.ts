import { Logger } from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';
import { PdfRenderError, PdfRenderer } from './pdf-renderer.js';
import { Semaphore } from './semaphore.js';

export interface PlaywrightPdfOptions {
  /** PDFs rendered at the same time; each uses a Chromium page (~50–100 MB). */
  concurrency: number;
  timeoutMs: number;
}

/**
 * Adapter: prints HTML with headless Chromium through Playwright. One browser is started on
 * first use and shared; every render gets a fresh context with JavaScript off and all network
 * requests blocked, so resume content can't make the server fetch anything.
 */
export class PlaywrightPdfRenderer extends PdfRenderer {
  private readonly logger = new Logger(PlaywrightPdfRenderer.name);
  private browser: Promise<Browser> | null = null;
  private readonly slots: Semaphore;

  constructor(private readonly options: PlaywrightPdfOptions) {
    super();
    this.slots = new Semaphore(options.concurrency);
  }

  render(html: string): Promise<Buffer> {
    return this.slots.run(async () => {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ javaScriptEnabled: false });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(this.options.timeoutMs);
        await page.route('**/*', (route) =>
          route.request().url().startsWith('data:') ? route.continue() : route.abort(),
        );
        await page.setContent(html, { waitUntil: 'load' });
        return await page.pdf({ preferCSSPageSize: true, printBackground: true });
      } catch (error) {
        throw new PdfRenderError('Chromium could not render the PDF', { cause: error });
      } finally {
        await context.close().catch(() => undefined);
      }
    });
  }

  async close(): Promise<void> {
    const browser = await this.browser?.catch(() => null);
    this.browser = null;
    await browser?.close();
  }

  private getBrowser(): Promise<Browser> {
    this.browser ??= chromium
      .launch({ headless: true, args: ['--disable-dev-shm-usage'] })
      .then((browser) => {
        browser.on('disconnected', () => {
          this.logger.warn('Chromium disconnected; it will restart on the next PDF');
          this.browser = null;
        });
        return browser;
      })
      .catch((error: unknown) => {
        this.browser = null;
        throw new PdfRenderError('Could not start Chromium', { cause: error });
      });
    return this.browser;
  }
}
