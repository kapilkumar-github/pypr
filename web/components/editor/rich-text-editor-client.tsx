"use client"

import { useState } from "react"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import { Placeholder } from "@tiptap/extensions"
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"
import { richTextExtensions, type RichTextValue } from "./rich-text-extensions"

export type RichTextEditorProps = {
  value?: RichTextValue | null
  onChange: (value: RichTextValue) => void
  placeholder?: string
  id?: string
  "aria-label"?: string
  className?: string
  minHeight?: string
}

export default function RichTextEditorClient({
  value,
  onChange,
  placeholder,
  id,
  "aria-label": ariaLabel,
  className,
  minHeight = "6rem",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [...richTextExtensions, Placeholder.configure({ placeholder: placeholder ?? "" })],
    content: value ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        role: "textbox",
        "aria-multiline": "true",
        class: "px-3 py-2",
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  })

  return (
    <div
      className={cn(
        "rich-text overflow-hidden rounded-lg border border-input bg-card transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className,
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      link: editor?.isActive("link") ?? false,
    }),
  })

  const marks = [
    { key: "bold", icon: Bold, label: "Bold", run: () => editor?.chain().focus().toggleBold().run() },
    { key: "italic", icon: Italic, label: "Italic", run: () => editor?.chain().focus().toggleItalic().run() },
    { key: "underline", icon: Underline, label: "Underline", run: () => editor?.chain().focus().toggleUnderline().run() },
    { key: "bulletList", icon: List, label: "Bulleted list", run: () => editor?.chain().focus().toggleBulletList().run() },
    { key: "orderedList", icon: ListOrdered, label: "Numbered list", run: () => editor?.chain().focus().toggleOrderedList().run() },
  ] as const

  return (
    <div className="flex items-center gap-0.5 border-b bg-muted/60 px-1.5 py-1">
      {marks.map(({ key, icon: Icon, label, run }) => (
        <Toggle
          key={key}
          size="sm"
          aria-label={label}
          pressed={state?.[key] ?? false}
          onPressedChange={run}
          disabled={!editor}
          className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          <Icon />
        </Toggle>
      ))}
      <LinkControl editor={editor} active={state?.link ?? false} />
    </div>
  )
}

function LinkControl({ editor, active }: { editor: Editor | null; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState("")

  function onOpenChange(next: boolean) {
    if (next) setHref(editor?.getAttributes("link").href ?? "")
    setOpen(next)
  }

  function apply(e: React.FormEvent) {
    e.preventDefault()
    const chain = editor?.chain().focus().extendMarkRange("link")
    if (href.trim()) chain?.setLink({ href: href.trim() }).run()
    else chain?.unsetLink().run()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Toggle
          size="sm"
          aria-label="Link"
          pressed={active}
          disabled={!editor}
          className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          <Link2 />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form onSubmit={apply} className="flex gap-2">
          <Input
            autoFocus
            type="url"
            placeholder="https://example.com"
            aria-label="Link URL"
            value={href}
            onChange={(e) => setHref(e.target.value)}
          />
          <Button type="submit" size="sm">
            {href.trim() ? "Apply" : "Remove"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
