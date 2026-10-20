import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText, richTextToPlain, serializeRichText } from './rich-text.js';

describe('parseRichText', () => {
  it('reads plain text from before rich text existed as paragraphs', () => {
    expect(parseRichText('Built things.\nShipped them.\n\nSecond paragraph.')).toEqual([
      { type: 'paragraph', runs: [{ text: 'Built things. Shipped them.' }] },
      { type: 'paragraph', runs: [{ text: 'Second paragraph.' }] },
    ]);
  });

  it('parses bold, italic and both', () => {
    expect(parseInline('a **b** *c* ***d***')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', bold: true, italic: true },
    ]);
  });

  it('keeps unmatched or escaped stars literal', () => {
    expect(parseInline('5* hotel')).toEqual([{ text: '5* hotel' }]);
    expect(parseInline('a \\*b\\* c')).toEqual([{ text: 'a *b* c' }]);
  });

  it('parses bulleted and numbered lists', () => {
    expect(parseRichText('Intro\n- one\n- **two**\n1. first\n2) second')).toEqual([
      { type: 'paragraph', runs: [{ text: 'Intro' }] },
      { type: 'bullets', items: [[{ text: 'one' }], [{ text: 'two', bold: true }]] },
      { type: 'numbers', items: [[{ text: 'first' }], [{ text: 'second' }]] },
    ]);
  });

  it('is empty for blank text', () => {
    expect(parseRichText('  \n\n ')).toEqual([]);
  });
});

describe('serializeRichText', () => {
  it.each([
    'Plain paragraph.',
    'A **bold** and *italic* word.',
    'Intro\n\n- one\n- two\n\n1. first\n2. second',
    'Price \\*not italic\\*',
  ])('round-trips %j', (text) => {
    expect(serializeRichText(parseRichText(text))).toBe(text);
  });

  it('keeps spaces outside markers', () => {
    expect(
      serializeRichText([
        { type: 'paragraph', runs: [{ text: 'a' }, { text: ' b ', bold: true }, { text: 'c' }] },
      ]),
    ).toBe('a **b** c');
  });
});

describe('richTextToPlain', () => {
  it('drops markup', () => {
    expect(richTextToPlain('**Lead** the team\n- one\n- two')).toBe('Lead the team one two');
  });
});
