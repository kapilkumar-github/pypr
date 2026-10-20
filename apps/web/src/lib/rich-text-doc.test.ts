import { describe, expect, it } from 'vitest';
import { docToRichText, richTextToDoc } from './rich-text-doc';

describe('rich text <-> editor document', () => {
  it.each([
    'Plain summary from before.',
    'A **bold** and *italic* word.',
    'Intro\n\n- one\n- two\n\n1. first\n2. second',
  ])('round-trips %j', (text) => {
    expect(docToRichText(richTextToDoc(text))).toBe(text);
  });

  it('gives the editor an empty paragraph for empty text, and empty text back', () => {
    expect(richTextToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(docToRichText(richTextToDoc(''))).toBe('');
  });

  it('flattens nested lists and ignores unknown nodes safely', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'outer' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inner' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
      ],
    };
    expect(docToRichText(doc)).toBe('- outer\n- inner\n\nTitle');
  });

  it('escapes literal stars typed by the user', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '5* hotel' }] }],
    };
    expect(docToRichText(doc)).toBe('5\\* hotel');
    expect(docToRichText(richTextToDoc(docToRichText(doc)))).toBe('5\\* hotel');
  });
});
