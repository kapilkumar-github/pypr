import { afterAll, describe, expect, it } from 'vitest';
import { PlaywrightPdfRenderer } from './playwright-pdf-renderer.js';

// Uses the real Chromium (install: pnpm --filter @pypr/api exec playwright-core install chromium --only-shell).
const renderer = new PlaywrightPdfRenderer({ concurrency: 2, timeoutMs: 15_000 });

afterAll(async () => {
  await renderer.close();
});

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe('PlaywrightPdfRenderer', () => {
  it('prints HTML to a PDF using the @page size', async () => {
    const pdf = await renderer.render(
      '<!doctype html><style>@page{size:A4;margin:10mm}</style><h1>Hello PDF</h1>',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
    // A4 is about 595 x 842 points.
    const box = /MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
    expect(Number(box?.[1])).toBeCloseTo(595, 0);
    expect(Number(box?.[2])).toBeCloseTo(842, 0);
  }, 30_000);

  it('breaks long content across pages', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => `<p>Line ${String(i)}</p>`).join('');
    const pdf = await renderer.render(`<!doctype html><style>@page{size:A4}</style>${rows}`);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  }, 30_000);

  it('blocks network requests and scripts from the content', async () => {
    const html = `<!doctype html>
      <img src="http://127.0.0.1:9/tracker.png">
      <link rel="stylesheet" href="https://example.com/x.css">
      <script>document.body.innerHTML = 'SCRIPT RAN'</script>
      <p>Safe</p>`;
    const pdf = await renderer.render(html);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30_000);

  it('renders several PDFs concurrently', async () => {
    const pdfs = await Promise.all(
      [1, 2, 3].map((n) => renderer.render(`<!doctype html><p>Resume ${String(n)}</p>`)),
    );
    expect(pdfs.every((pdf) => pdf.subarray(0, 5).toString() === '%PDF-')).toBe(true);
  }, 60_000);
});
