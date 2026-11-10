"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** A list of short values (skills, technologies) typed as chips, with optional one-click suggestions. */
export function ChipInput({
  id,
  label,
  description,
  error,
  value,
  onChange,
  suggestions = [],
  suggestionsLabel = "Suggestions",
  placeholder = "Type and press Enter",
  max = 20,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  error?: string
  value: string[]
  onChange: (value: string[]) => void
  suggestions?: string[]
  suggestionsLabel?: string
  placeholder?: string
  max?: number
}) {
  const [draft, setDraft] = useState("")
  const has = (s: string) => value.some((v) => v.toLowerCase() === s.trim().toLowerCase())
  const add = (raw: string) => {
    const items = raw.split(",").map((s) => s.trim()).filter((s) => s && !has(s))
    if (items.length) onChange([...value, ...items].slice(0, max))
    setDraft("")
  }
  const open = suggestions.filter((s) => !has(s)).slice(0, 12)

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        {value.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          id={id}
          value={draft}
          disabled={value.length >= max}
          placeholder={value.length ? "" : placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(draft)
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          className="h-6 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">{suggestionsLabel}:</span>
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="flex items-center gap-0.5 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground transition-colors outline-none hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-3" /> {s}
            </button>
          ))}
        </div>
      )}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
