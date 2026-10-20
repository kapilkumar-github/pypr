'use client';

import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { docToRichText, richTextToDoc, type DocNode } from '@/lib/rich-text-doc';

/**
 * Rich-text input for summaries: bold, italic, bulleted and numbered lists. The value is the
 * stored Markdown subset (resume-core rich-text), never HTML.
 */
export function RichTextField({
  label,
  value,
  onChange,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string;
}) {
  const id = useId();
  const lastEmitted = useRef(value);
  const editor = useEditor({
    immediatelyRender: false, // rendered on the client only (avoids hydration mismatches)
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
        hardBreak: false,
      }),
    ],
    content: richTextToDoc(value),
    editorProps: {
      attributes: {
        id: `${id}-input`,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': `${id}-label`,
        ...(error ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-error` } : {}),
        ...(!error && hint ? { 'aria-describedby': `${id}-hint` } : {}),
        class: 'rich-editor min-h-24 px-3 py-2 text-sm leading-relaxed text-ink outline-none',
      },
    },
    onUpdate: ({ editor: e }) => {
      const next = docToRichText(e.getJSON() as DocNode);
      lastEmitted.current = next;
      onChange(next);
    },
  });

  // Outside changes (not from typing here) replace the editor's content.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(richTextToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      bullets: e?.isActive('bulletList') ?? false,
      numbers: e?.isActive('orderedList') ?? false,
    }),
  });

  const tool = (name: string, pressed: boolean, run: () => void, icon: ReactNode) => (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-pressed={pressed}
      disabled={!editor}
      onMouseDown={(e) => {
        e.preventDefault(); // keep the selection in the editor
      }}
      onClick={run}
      className={cn(
        'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
        pressed ? 'bg-ink/[0.12] text-ink' : 'text-ink-muted hover:bg-ink/[0.06] hover:text-ink',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      <span id={`${id}-label`} className="block text-sm font-medium">
        {label}
      </span>
      <div
        className={cn(
          'rounded-lg border border-line bg-canvas transition-colors focus-within:border-highlight focus-within:ring-1 focus-within:ring-highlight',
          error && 'border-danger',
        )}
      >
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          className="flex gap-0.5 border-b border-line p-1"
        >
          {tool(
            'Bold',
            active?.bold ?? false,
            () => editor?.chain().focus().toggleBold().run(),
            <b>B</b>,
          )}
          {tool(
            'Italic',
            active?.italic ?? false,
            () => editor?.chain().focus().toggleItalic().run(),
            <i className="font-serif">I</i>,
          )}
          {tool(
            'Bulleted list',
            active?.bullets ?? false,
            () => editor?.chain().focus().toggleBulletList().run(),
            <ListIcon />,
          )}
          {tool(
            'Numbered list',
            active?.numbers ?? false,
            () => editor?.chain().focus().toggleOrderedList().run(),
            <NumberedIcon />,
          )}
        </div>
        <EditorContent editor={editor} />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function NumberedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M10 6h10M10 12h10M10 18h10M4 4v4M3 14h3l-3 4h3" />
    </svg>
  );
}
