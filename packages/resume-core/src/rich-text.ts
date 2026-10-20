/**
 * Rich text for summaries and descriptions (decision D25): a small Markdown subset stored as a
 * plain string, so the data model doesn't change and plain text from before (or from imports)
 * is already valid. Supported: paragraphs, **bold**, *italic*, "- " bullets and "1. " numbered
 * lists. No HTML is ever stored or rendered from it; templates render the parsed blocks.
 */

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type RichBlock =
  | { type: 'paragraph'; runs: TextRun[] }
  | { type: 'bullets'; items: TextRun[][] }
  | { type: 'numbers'; items: TextRun[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

/** Inline markup to runs. Unmatched markers stay literal; "\*" is a literal star. */
export function parseInline(source: string): TextRun[] {
  const runs: TextRun[] = [];
  let bold = false;
  let italic = false;
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    const run: TextRun = { text: buffer };
    if (bold) run.bold = true;
    if (italic) run.italic = true;
    const last = runs.at(-1);
    if (last && Boolean(last.bold) === bold && Boolean(last.italic) === italic) last.text += buffer;
    else runs.push(run);
    buffer = '';
  };
  // Only toggle on a marker that has a partner later in the text, so "5* hotel" stays literal.
  const hasPartner = (from: number, marker: string) => {
    for (let j = from; j < source.length; j += 1) {
      if (source[j] === '\\') {
        j += 1;
        continue;
      }
      if (source.startsWith(marker, j) && (marker === '**' || source[j + 1] !== '*')) return true;
    }
    return false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\' && (source[i + 1] === '*' || source[i + 1] === '\\')) {
      buffer += source[i + 1] ?? '';
      i += 1;
    } else if (source.startsWith('**', i) && (bold || hasPartner(i + 2, '**'))) {
      flush();
      bold = !bold;
      i += 1;
    } else if (ch === '*' && (italic || hasPartner(i + 1, '*'))) {
      flush();
      italic = !italic;
    } else {
      buffer += ch ?? '';
    }
  }
  flush();
  return runs;
}

/** Text to blocks. Lines in a paragraph are joined with spaces; blank lines separate blocks. */
export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: 'paragraph', runs: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    if (bullet || number) {
      endParagraph();
      const type = bullet ? 'bullets' : 'numbers';
      const runs = parseInline((bullet ?? number)?.[1] ?? '');
      const last = blocks.at(-1);
      if (last && last.type === type) last.items.push(runs);
      else blocks.push({ type, items: [runs] });
    } else if (line.trim() === '') {
      endParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  return blocks.filter((b) => b.type !== 'paragraph' || b.runs.some((r) => r.text.trim()));
}

const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*');

export function serializeInline(runs: readonly TextRun[]): string {
  return runs
    .map((run) => {
      // Markers can't wrap surrounding spaces in Markdown, so keep them outside.
      const match = /^(\s*)(.*?)(\s*)$/s.exec(run.text);
      const [lead = '', core = '', trail = ''] = match ? match.slice(1) : ['', run.text, ''];
      if (!core) return run.text;
      let out = escapeText(core);
      if (run.italic) out = `*${out}*`;
      if (run.bold) out = `**${out}**`;
      return lead + out + trail;
    })
    .join('');
}

/** Blocks back to text (inverse of parseRichText for content it produced). */
export function serializeRichText(blocks: readonly RichBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'paragraph') return serializeInline(block.runs);
      return block.items
        .map(
          (item, i) =>
            `${block.type === 'bullets' ? '-' : `${String(i + 1)}.`} ${serializeInline(item)}`,
        )
        .join('\n');
    })
    .join('\n\n');
}

/** Plain text without markup, e.g. for collapsed-entry labels or search. */
export function richTextToPlain(source: string): string {
  return parseRichText(source)
    .map((block) =>
      block.type === 'paragraph'
        ? block.runs.map((r) => r.text).join('')
        : block.items.map((item) => item.map((r) => r.text).join('')).join(' '),
    )
    .join(' ');
}
