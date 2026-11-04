"use client"

import { useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns2,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  FileStack,
  GripVertical,
  Heading,
  MoreHorizontal,
  PanelLeft,
  PencilLine,
  Plus,
  Trash2,
  X,
} from "lucide-react"

import { TextField } from "@/components/common/text-field"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { isTwoColumn } from "@/components/resume/document/templates"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { newId } from "@/lib/resume/ids"
import {
  ADDABLE_SECTIONS,
  blankEntry,
  isCustom,
  SECTION_INFO,
  sectionEntries,
  sectionMeta,
  sectionTitle,
  singularName,
  withSectionEntries,
  type AnyEntry,
} from "@/lib/resume/sections"
import type { PersonalInfo, ResumeData, SectionId, SectionMeta } from "@/lib/resume/types"
import { cn } from "@/lib/utils"
import { ENTRY_DEFS, type FieldDef } from "./entry-fields"

type Props = { data: ResumeData; onChange: (data: ResumeData) => void }

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it!)
  return next
}

/** Write mode: header details, then every section in print order. */
export function WritePanel({ data, onChange }: Props) {
  const [open, setOpen] = useState<Set<SectionId>>(() => new Set())
  const [renaming, setRenaming] = useState<SectionId | null>(null)
  const [removing, setRemoving] = useState<SectionMeta | null>(null)
  const [dragging, setDragging] = useState<SectionId | null>(null)
  const twoColumn = isTwoColumn(data.settings.template)

  const toggle = (id: SectionId, force?: boolean) =>
    setOpen((s) => {
      const next = new Set(s)
      if (force ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })
  const setMeta = (id: SectionId, patch: Partial<SectionMeta>) =>
    onChange({ ...data, sections: data.sections.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const moveSection = (id: SectionId, toId: SectionId) => {
    const from = data.sections.findIndex((m) => m.id === id)
    const to = data.sections.findIndex((m) => m.id === toId)
    onChange({ ...data, sections: move(data.sections, from, to) })
  }

  const visible = data.sections.filter((m) => !m.hidden)
  const hidden = data.sections.filter((m) => m.hidden)
  const present = new Set(data.sections.map((m) => m.id))

  const addSection = (id: SectionId) => {
    onChange({ ...data, sections: [...data.sections, sectionMeta(id)] })
    toggle(id, true)
  }
  const addCustom = () => {
    const cid = newId()
    const id = `custom:${cid}` as const
    onChange({
      ...data,
      customSections: [...data.customSections, { id: cid, items: [] }],
      sections: [...data.sections, sectionMeta(id)],
    })
    toggle(id, true)
    setRenaming(id)
  }
  const removeSection = (meta: SectionMeta) => {
    const cleared = isCustom(meta.id)
      ? { ...data, customSections: data.customSections.filter((c) => `custom:${c.id}` !== meta.id) }
      : withSectionEntries(data, meta.id, [])
    onChange({ ...cleared, sections: data.sections.filter((m) => m.id !== meta.id) })
  }

  const row = (meta: SectionMeta, list: SectionMeta[]) => {
    const i = list.findIndex((m) => m.id === meta.id)
    return (
      <SectionRow
        key={meta.id}
        meta={meta}
        data={data}
        onChange={onChange}
        open={open.has(meta.id)}
        onToggle={() => toggle(meta.id)}
        onOpen={() => toggle(meta.id, true)}
        renaming={renaming === meta.id}
        onRename={(title) => {
          if (title !== undefined) setMeta(meta.id, { title: title.trim().slice(0, 80) })
          setRenaming(title === undefined ? meta.id : null)
        }}
        setMeta={(patch) => setMeta(meta.id, patch)}
        canMoveUp={i > 0}
        canMoveDown={i < list.length - 1}
        onMoveBy={(delta) => list[i + delta] && moveSection(meta.id, list[i + delta]!.id)}
        onRemove={() => (sectionEntries(data, meta.id).length > 0 ? setRemoving(meta) : removeSection(meta))}
        twoColumn={twoColumn}
        dragging={dragging}
        onDragStart={() => setDragging(meta.id)}
        onDragEnd={() => setDragging(null)}
        onDropOn={() => dragging && dragging !== meta.id && moveSection(dragging, meta.id)}
      />
    )
  }

  return (
    <div className="space-y-4 p-3">
      <ProfileCard value={data.personalInfo} onChange={(personalInfo) => onChange({ ...data, personalInfo })} />

      <div>
        <div className="flex items-baseline justify-between px-1 pb-1.5 text-xs text-muted-foreground">
          <span>Sections · print order</span>
          <span className="hidden sm:inline">drag, or Alt + ↑↓</span>
        </div>
        <div className="space-y-1">{visible.map((m) => row(m, visible))}</div>

        {hidden.length > 0 && (
          <>
            <p className="px-1 pt-4 pb-1.5 text-xs text-muted-foreground">Hidden sections</p>
            <div className="space-y-1">{hidden.map((m) => row(m, hidden))}</div>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="mt-3 w-full border-dashed">
              <Plus data-icon="inline-start" /> Add section
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-64">
            {ADDABLE_SECTIONS.filter((id) => !present.has(id)).map((id) => (
              <DropdownMenuItem key={id} onSelect={() => addSection(id)}>
                {SECTION_INFO[id].name}
              </DropdownMenuItem>
            ))}
            {ADDABLE_SECTIONS.some((id) => !present.has(id)) && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={addCustom}>
              <Plus /> Custom section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="mt-3 px-1 text-xs text-muted-foreground">
          Hidden sections and entries keep their content but aren&apos;t printed or shared. Changes save as you type.
        </p>
      </div>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing ? sectionTitle(removing) : "section"}?</AlertDialogTitle>
            <AlertDialogDescription>Its entries are deleted too. To keep them off the page instead, hide the section.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) removeSection(removing)
                setRemoving(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  )
}

function ProfileCard({ value, onChange }: { value: PersonalInfo; onChange: (value: PersonalInfo) => void }) {
  const [open, setOpen] = useState(true)
  const field = (key: Exclude<keyof PersonalInfo, "summary" | "links">, label: string, extra?: Partial<React.ComponentProps<typeof TextField>>) => (
    <TextField id={`personal-${key}`} label={label} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} {...extra} />
  )
  const setLinks = (links: PersonalInfo["links"]) => onChange({ ...value, links })

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl p-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
          {initials(value.fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{value.fullName || "Your name"}</span>
          <span className="block truncate text-xs text-muted-foreground">{value.jobTitle || "Headline"}</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {field("fullName", "Full name", { autoComplete: "name" })}
          {field("jobTitle", "Headline", { placeholder: "Senior Software Engineer" })}
          <div className="grid grid-cols-2 gap-3">
            {field("email", "Email", { type: "email", autoComplete: "email" })}
            {field("phone", "Phone", { type: "tel", autoComplete: "tel" })}
          </div>
          {field("location", "Location", { placeholder: "City, Country" })}
          {field("website", "Website", { placeholder: "yoursite.dev" })}
          <div className="grid grid-cols-2 gap-3">
            {field("linkedin", "LinkedIn", { placeholder: "linkedin.com/in/you" })}
            {field("github", "GitHub", { placeholder: "github.com/you" })}
          </div>

          <div className="space-y-2">
            {value.links.map((l, i) => (
              <div key={l.id} className="flex items-center gap-1">
                <Input
                  aria-label={`Link ${i + 1} label`}
                  placeholder="Label"
                  value={l.label}
                  onChange={(e) => setLinks(value.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
                  className="w-28 shrink-0"
                />
                <Input
                  aria-label={`Link ${i + 1} URL`}
                  placeholder="https://"
                  value={l.url}
                  onChange={(e) => setLinks(value.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Move link ${i + 1} up`} disabled={i === 0} onClick={() => setLinks(move(value.links, i, i - 1))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks(value.links.filter((x) => x.id !== l.id))}>
                  <X />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => setLinks([...value.links, { id: newId(), label: "", url: "" }])}>
              <Plus data-icon="inline-start" /> Add link
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionRow({
  meta,
  data,
  onChange,
  open,
  onToggle,
  onOpen,
  renaming,
  onRename,
  setMeta,
  canMoveUp,
  canMoveDown,
  onMoveBy,
  onRemove,
  twoColumn,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  meta: SectionMeta
  data: ResumeData
  onChange: (data: ResumeData) => void
  open: boolean
  onToggle: () => void
  onOpen: () => void
  renaming: boolean
  /** `undefined` starts renaming; a string saves it. */
  onRename: (title?: string) => void
  setMeta: (patch: Partial<SectionMeta>) => void
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveBy: (delta: number) => void
  onRemove: () => void
  twoColumn: boolean
  dragging: SectionId | null
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
}) {
  const [over, setOver] = useState(false)
  const [newEntry, setNewEntry] = useState<string | null>(null)
  const title = sectionTitle(meta)
  const entries = sectionEntries(data, meta.id)
  const isSummary = meta.id === "summary"
  const removable = isCustom(meta.id) || (!isSummary && SECTION_INFO[meta.id].optional)

  const addEntry = () => {
    const e = blankEntry(meta.id)
    onChange(withSectionEntries(data, meta.id, [...entries, e]))
    setNewEntry(e.id)
    onOpen()
  }

  return (
    <div
      onDragOver={(e) => {
        if (!dragging || dragging === meta.id) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDropOn()
      }}
      className={cn(
        "rounded-lg transition-colors",
        open && "bg-card ring-1 ring-border",
        over && "ring-2 ring-primary",
        dragging === meta.id && "opacity-50",
      )}
    >
      <div className={cn("group flex h-10 items-center gap-0.5 rounded-lg pr-1 hover:bg-muted/50", meta.hidden && "text-muted-foreground")}>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move"
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            if (!e.altKey) return
            if (e.key === "ArrowUp" && canMoveUp) onMoveBy(-1)
            else if (e.key === "ArrowDown" && canMoveDown) onMoveBy(1)
            else return
            e.preventDefault()
          }}
          aria-label={`Reorder ${title}. Alt plus arrow keys move it.`}
          className="flex h-8 w-6 cursor-grab items-center justify-center rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        {renaming ? (
          <Input
            autoFocus
            aria-label={`Rename ${title}`}
            defaultValue={meta.title || title}
            maxLength={80}
            className="h-7 flex-1"
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename(e.currentTarget.value)
              if (e.key === "Escape") onRename(meta.title)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={cn("min-w-0 flex-1 truncate px-1 text-left text-sm font-medium outline-none focus-visible:underline", meta.hidden && "line-through")}
          >
            {title}
          </button>
        )}

        {!isSummary && <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{entries.length || ""}</span>}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={meta.hidden ? `Show ${title} on the page` : `Hide ${title} from the page`}
          aria-pressed={meta.hidden}
          onClick={() => setMeta({ hidden: !meta.hidden })}
        >
          {meta.hidden ? <EyeOff /> : <Eye />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={open ? `Close ${title}` : `Open ${title}`} onClick={onToggle}>
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!isSummary && (
              <DropdownMenuItem onSelect={addEntry}>
                <Plus /> Add {singularName(meta.id)}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMoveBy(-1)}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMoveBy(1)}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => onRename(), 0)}>
              <PencilLine /> Rename…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={!meta.hideHeading} onCheckedChange={(c) => setMeta({ hideHeading: !c })}>
              <Heading /> Show heading
            </DropdownMenuCheckboxItem>
            {!isSummary && (
              <DropdownMenuCheckboxItem checked={meta.columns === 2} onCheckedChange={(c) => setMeta({ columns: c ? 2 : 1 })}>
                <Columns2 /> Two columns
              </DropdownMenuCheckboxItem>
            )}
            {twoColumn && (
              <DropdownMenuCheckboxItem checked={meta.column === "side"} onCheckedChange={(c) => setMeta({ column: c ? "side" : "main" })}>
                <PanelLeft /> In the sidebar
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuCheckboxItem checked={meta.pageBreak} onCheckedChange={(c) => setMeta({ pageBreak: c === true })}>
              <FileStack /> Start on a new page
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isSummary ? !data.personalInfo.summary : entries.length === 0}
              onSelect={() =>
                onChange(isSummary ? { ...data, personalInfo: { ...data.personalInfo, summary: null } } : withSectionEntries(data, meta.id, []))
              }
            >
              <Eraser /> Clear section
            </DropdownMenuItem>
            {removable && (
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 /> Remove section
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div className="space-y-2 px-2 pt-1 pb-3">
          {isSummary ? (
            <Field>
              <RichTextEditor
                key={String(data.personalInfo.summary === null)}
                aria-label="Summary"
                value={data.personalInfo.summary}
                onChange={(summary) => onChange({ ...data, personalInfo: { ...data.personalInfo, summary } })}
                placeholder="Backend engineer with 5 years building payment systems…"
              />
              <FieldDescription>2–4 sentences: who you are, your strongest results, what you&apos;re looking for.</FieldDescription>
            </Field>
          ) : (
            <EntryList
              sectionId={meta.id}
              entries={entries}
              onChange={(next) => onChange(withSectionEntries(data, meta.id, next))}
              openId={newEntry}
              onOpenChange={setNewEntry}
              onAdd={addEntry}
            />
          )}
        </div>
      )}
    </div>
  )
}

function EntryList({
  sectionId,
  entries,
  onChange,
  openId,
  onOpenChange,
  onAdd,
}: {
  sectionId: SectionId
  entries: AnyEntry[]
  onChange: (entries: AnyEntry[]) => void
  openId: string | null
  onOpenChange: (id: string | null) => void
  onAdd: () => void
}) {
  const def = ENTRY_DEFS[isCustom(sectionId) ? "custom" : (sectionId as keyof typeof ENTRY_DEFS)]
  const [dragging, setDragging] = useState<number | null>(null)

  return (
    <div className="space-y-1.5">
      {entries.map((e, i) => {
        const open = openId === e.id
        const set = (patch: Partial<AnyEntry>) => onChange(entries.map((x) => (x.id === e.id ? { ...x, ...patch } : x)))
        return (
          <div
            key={e.id}
            onDragOver={(ev) => dragging !== null && dragging !== i && ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              if (dragging !== null) onChange(move(entries, dragging, i))
              setDragging(null)
            }}
            className={cn("rounded-lg border bg-background", open && "border-primary/60", dragging === i && "opacity-50")}
          >
            <div className="flex items-center gap-0.5 pr-1">
              <span
                draggable
                onDragStart={() => setDragging(i)}
                onDragEnd={() => setDragging(null)}
                aria-hidden
                className="flex h-12 w-6 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-foreground"
              >
                <GripVertical className="size-3.5" />
              </span>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onOpenChange(open ? null : e.id)}
                className={cn("min-w-0 flex-1 py-2 text-left outline-none focus-visible:underline", e.hidden && "opacity-50")}
              >
                <span className="block truncate text-sm font-medium">{def.title(e)}</span>
                <span className="block truncate text-xs text-muted-foreground">{def.subtitle(e) || " "}</span>
              </button>
              {e.hidden && <EyeOff className="size-3.5 text-muted-foreground" aria-label="Hidden from the page" />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Options for ${def.title(e)}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => set({ hidden: !e.hidden })}>
                    {e.hidden ? <Eye /> : <EyeOff />} {e.hidden ? "Show on page" : "Hide from page"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      const copy = { ...structuredClone(e), id: newId() }
                      onChange([...entries.slice(0, i + 1), copy, ...entries.slice(i + 1)])
                      onOpenChange(copy.id)
                    }}
                  >
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === 0} onSelect={() => onChange(move(entries, i, i - 1))}>
                    <ArrowUp /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === entries.length - 1} onSelect={() => onChange(move(entries, i, i + 1))}>
                    <ArrowDown /> Move down
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onChange(entries.filter((x) => x.id !== e.id))}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {open && (
              <div className="grid grid-cols-2 gap-3 border-t p-3">
                {def.fields.map((f) => (
                  <EntryField key={f.key} def={f} entry={e} set={set} />
                ))}
              </div>
            )}
          </div>
        )
      })}
      <Button variant="ghost" size="sm" className="text-primary" onClick={onAdd}>
        <Plus data-icon="inline-start" /> Add {singularName(sectionId)}
      </Button>
    </div>
  )
}

function EntryField({ def, entry, set }: { def: FieldDef; entry: AnyEntry; set: (patch: Partial<AnyEntry>) => void }) {
  const id = `${entry.id}-${def.key}`
  const value = typeof entry[def.key] === "string" ? (entry[def.key] as string) : ""
  const span = def.half ? "col-span-1" : "col-span-2"

  if (def.kind === "current") {
    return (
      <Field orientation="horizontal" className="col-span-2">
        <Checkbox
          id={id}
          checked={entry.current === true}
          onCheckedChange={(c) => set({ current: c === true, ...(c === true ? { endDate: "" } : {}) })}
        />
        <FieldLabel htmlFor={id} className="font-normal">
          {def.label}
        </FieldLabel>
      </Field>
    )
  }
  if (def.kind === "rich") {
    return (
      <Field className="col-span-2">
        <FieldLabel>{def.label}</FieldLabel>
        <RichTextEditor
          aria-label={def.label}
          value={entry[def.key] as never}
          onChange={(v) => set({ [def.key]: v })}
          placeholder={def.placeholder}
        />
        {def.description && <FieldDescription>{def.description}</FieldDescription>}
      </Field>
    )
  }
  const disabled = def.key === "endDate" && entry.current === true
  return (
    <div className={span}>
      <TextField
        id={id}
        label={def.label}
        type={def.kind === "month" ? "month" : "text"}
        inputMode={def.kind === "url" ? "url" : undefined}
        placeholder={disabled ? "Present" : def.placeholder}
        description={def.description}
        disabled={disabled}
        value={disabled ? "" : value}
        onChange={(ev) => set({ [def.key]: ev.target.value })}
      />
    </div>
  )
}
