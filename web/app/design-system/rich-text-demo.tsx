"use client"

import { useState } from "react"

import { RichTextEditor, type RichTextValue } from "@/components/editor/rich-text-editor"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

export function RichTextDemo() {
  const [value, setValue] = useState<RichTextValue | null>(null)

  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel>Professional summary</FieldLabel>
        <RichTextEditor
          aria-label="Professional summary"
          value={value}
          onChange={setValue}
          placeholder="Senior engineer with 6 years building distributed systems…"
        />
        <FieldDescription>Bold, italic, underline, lists and links. Stored as Tiptap JSON.</FieldDescription>
      </Field>
      <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] text-muted-foreground">
        {JSON.stringify(value, null, 2) ?? "null"}
      </pre>
    </div>
  )
}
