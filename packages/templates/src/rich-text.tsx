import { parseRichText, type TextRun } from '@pypr/resume-core';
import { Fragment, type ReactElement } from 'react';

function Runs({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        let node: ReactElement | string = run.text;
        if (run.italic) node = <em>{node}</em>;
        if (run.bold) node = <strong>{node}</strong>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

/** Renders stored rich text (Markdown subset) as React elements: escaped, never raw HTML. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;
  return (
    <div className={className ? `rich ${className}` : 'rich'}>
      {blocks.map((block, i) => {
        if (block.type === 'paragraph') {
          return (
            <p key={i}>
              <Runs runs={block.runs} />
            </p>
          );
        }
        const items = block.items.map((item, j) => (
          <li key={j}>
            <Runs runs={item} />
          </li>
        ));
        return block.type === 'bullets' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
      })}
    </div>
  );
}
