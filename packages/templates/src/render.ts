import type { ResumeContent } from '@pypr/resume-core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PAGE_SIZES, type PageSize } from './contract.js';
import { getTemplate } from './registry.js';
import { settingsCss } from './settings.js';
import { toResumeView } from './view-model.js';

export interface RenderOptions {
  pageSize?: PageSize;
  /** Margin inside each page, as CSS length. */
  margin?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A complete, self-contained HTML document for a resume: no scripts, no external requests.
 * The editor shows it in a sandboxed iframe and the API prints it to PDF, so both match.
 * On screen the page is drawn as a sheet of paper; in print the @page rules take over.
 */
export function renderResumeHtml(content: ResumeContent, options: RenderOptions = {}): string {
  const template = getTemplate(content.template);
  const size = PAGE_SIZES[options.pageSize ?? 'A4'];
  const margin = options.margin ?? '16mm';
  const body = renderToStaticMarkup(
    createElement(template.Component, { resume: toResumeView(content) }),
  );
  const title = escapeHtml(content.title.trim() || content.basics.fullName.trim() || 'Resume');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${title}</title>
<style>
@page { size: ${options.pageSize ?? 'A4'}; margin: ${margin}; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
@media screen {
  html { background: #e4e4e7; }
  body { padding: 24px 0; }
  .page { box-sizing: border-box; width: ${size.width}; min-height: ${size.height}; margin: 0 auto; padding: ${margin}; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08); }
}
${template.css}
.resume { ${settingsCss(content.settings)}; }
</style>
</head>
<body><main class="page">${body}</main></body>
</html>`;
}
