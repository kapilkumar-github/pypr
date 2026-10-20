import type { ReactElement } from 'react';
import type { ResumeView } from './view-model.js';

/**
 * What every template provides (decision D7). A template is a pure React component of the
 * prepared resume view plus its own stylesheet; it never fetches, never runs scripts, and
 * renders identically in the browser preview and in the PDF.
 */
export interface ResumeTemplate {
  /** Stable slug stored on resumes. */
  id: string;
  name: string;
  description: string;
  /** Stylesheet for the template's markup. Scope selectors under `.resume`. */
  css: string;
  Component: (props: { resume: ResumeView }) => ReactElement;
}

export type PageSize = 'A4' | 'Letter';

export const PAGE_SIZES: Record<PageSize, { width: string; height: string }> = {
  A4: { width: '210mm', height: '297mm' },
  Letter: { width: '8.5in', height: '11in' },
};
