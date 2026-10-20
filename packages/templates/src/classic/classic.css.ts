// Plain CSS so the preview and the PDF use exactly the same rules. System fonts only: the PDF
// renderer has no network access (decision D7). Resume settings arrive as CSS variables
// (--resume-accent-text, --resume-font, --resume-space, ...; see settings.ts), with fallbacks.
export const classicCss = /* css */ `
.resume {
  font-family: var(--resume-font, "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif);
  font-size: 10pt;
  line-height: var(--resume-line-height, 1.45);
  --s: var(--resume-space, 1);
  color: #18181b;
}
.resume a { color: inherit; text-decoration: none; }
.resume p, .resume h1, .resume h2, .resume h3, .resume ul { margin: 0; }

.masthead { margin-bottom: calc(14pt * var(--s)); }
.name { font-size: 22pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.headline { margin-top: 3pt; font-size: 11.5pt; color: #3f3f46; }
.contacts { display: flex; flex-wrap: wrap; gap: 2pt 0; margin-top: 7pt; padding: 0; list-style: none; font-size: 9pt; color: #52525b; }
.contacts li + li::before { content: "·"; margin: 0 6pt; color: #a1a1aa; }

.summary { margin-bottom: calc(12pt * var(--s)); color: #27272a; }

.section { margin-top: calc(12pt * var(--s)); }
.section-title {
  font-size: 9pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--resume-accent-text, #3f3f46); padding-bottom: calc(3pt * var(--s));
  margin-bottom: calc(7pt * var(--s)); border-bottom: 0.75pt solid var(--resume-accent-line, #d4d4d8);
  break-after: avoid;
}

.entry { break-inside: avoid; }
.entry + .entry { margin-top: calc(8pt * var(--s)); }
.entry-compact + .entry-compact { margin-top: calc(3pt * var(--s)); }
.entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; }
.entry-title { font-size: 10.5pt; font-weight: 600; }
.entry-subtitle { font-weight: 400; color: #3f3f46; }
.entry-dates { flex-shrink: 0; font-size: 9pt; color: #52525b; font-variant-numeric: tabular-nums; }
.entry-meta { font-size: 9pt; color: #71717a; }
.entry-summary { margin-top: calc(3pt * var(--s)); }
.entry-bullets { margin-top: calc(3pt * var(--s)); padding-left: 13pt; }
.entry-bullets li + li { margin-top: 1.5pt; }
.entry-compact { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4pt; }
.entry-compact .entry-head { display: block; }
.entry-compact .entry-title { font-size: 10pt; }
.entry-compact .entry-title::after { content: ":"; }
.entry-compact .entry-title:empty::after { content: none; }
.inline-list { color: #27272a; }
.entry-bullets li::marker { color: var(--resume-accent-text, currentColor); }
.rich p + p, .rich p + ul, .rich p + ol, .rich ul + p, .rich ol + p { margin-top: calc(3pt * var(--s)); }
.rich ul, .rich ol { margin: 0; padding-left: 13pt; }
.rich li + li { margin-top: 1.5pt; }
.rich li::marker { color: var(--resume-accent-text, currentColor); }
`;
