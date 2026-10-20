/**
 * Port for turning a self-contained HTML document into a PDF (decisions D7, D13). Page size
 * and margins come from the document's @page rules.
 */
export abstract class PdfRenderer {
  abstract render(html: string): Promise<Buffer>;
}

export class PdfRenderError extends Error {
  override readonly name = 'PdfRenderError';
}
