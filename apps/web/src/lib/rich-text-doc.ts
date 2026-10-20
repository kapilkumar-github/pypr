import { parseRichText, serializeRichText, type RichBlock, type TextRun } from '@pypr/resume-core';

/**
 * Converts between the stored rich-text format (a Markdown subset, see resume-core) and the
 * editor's document JSON. Only paragraphs, bold, italic and flat lists exist on both sides;
 * anything else in the editor document is flattened to text.
 */
export interface DocNode {
  type: string;
  text?: string;
  marks?: { type: string }[];
  content?: DocNode[];
}

const textNodes = (runs: TextRun[]): DocNode[] =>
  runs
    .filter((run) => run.text)
    .map((run) => {
      const marks = [run.bold && { type: 'bold' }, run.italic && { type: 'italic' }].filter(
        (m): m is { type: string } => Boolean(m),
      );
      return marks.length
        ? { type: 'text', text: run.text, marks }
        : { type: 'text', text: run.text };
    });

const paragraph = (runs: TextRun[]): DocNode => {
  const content = textNodes(runs);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

export function richTextToDoc(text: string): DocNode {
  const content = parseRichText(text).map((block): DocNode => {
    if (block.type === 'paragraph') return paragraph(block.runs);
    return {
      type: block.type === 'bullets' ? 'bulletList' : 'orderedList',
      content: block.items.map((runs) => ({ type: 'listItem', content: [paragraph(runs)] })),
    };
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function runsOf(node: DocNode): TextRun[] {
  if (node.type === 'text') {
    const run: TextRun = { text: node.text ?? '' };
    if (node.marks?.some((m) => m.type === 'bold')) run.bold = true;
    if (node.marks?.some((m) => m.type === 'italic')) run.italic = true;
    return [run];
  }
  return (node.content ?? []).flatMap((child, i) =>
    // Separate block children (e.g. two paragraphs in one list item) with a space.
    i > 0 && child.type === 'paragraph' ? [{ text: ' ' }, ...runsOf(child)] : runsOf(child),
  );
}

/** List items, flattening nested lists into the same list. */
function listItems(list: DocNode): TextRun[][] {
  return (list.content ?? []).flatMap((item) => {
    const own = (item.content ?? []).filter(
      (c) => c.type !== 'bulletList' && c.type !== 'orderedList',
    );
    const nested = (item.content ?? []).filter(
      (c) => c.type === 'bulletList' || c.type === 'orderedList',
    );
    return [own.flatMap(runsOf), ...nested.flatMap(listItems)];
  });
}

export function docToRichText(doc: DocNode): string {
  const blocks: RichBlock[] = (doc.content ?? []).map((node): RichBlock => {
    if (node.type === 'bulletList') return { type: 'bullets', items: listItems(node) };
    if (node.type === 'orderedList') return { type: 'numbers', items: listItems(node) };
    return { type: 'paragraph', runs: runsOf(node) };
  });
  return serializeRichText(
    blocks.filter((b) =>
      b.type === 'paragraph' ? b.runs.some((r) => r.text.trim()) : b.items.length > 0,
    ),
  );
}
