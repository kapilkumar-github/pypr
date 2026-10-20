import { PdfRenderer } from '../../src/integrations/pdf/pdf-renderer.js';

/** Test adapter: records the HTML and returns a tiny fake PDF instead of starting Chromium. */
export class FakePdfRenderer extends PdfRenderer {
  readonly rendered: string[] = [];
  failNext = false;

  render(html: string): Promise<Buffer> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('simulated failure'));
    }
    this.rendered.push(html);
    return Promise.resolve(Buffer.from(`%PDF-1.7 fake (${String(html.length)} bytes of HTML)`));
  }
}
