"use client"

import { useState } from "react"
import { Check, RotateCcw } from "lucide-react"

import { Segmented } from "@/components/common/segmented"
import { ResumeThumbnail } from "@/components/resume/document/resume-thumbnail"
import { FONT_CLASS } from "@/components/resume/document/templates"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEFAULT_SETTINGS } from "@/lib/resume/defaults"
import { contrastRatio, isHexColor } from "@/lib/resume/color"
import {
  ACCENT_COLORS,
  DATE_FORMATS,
  DENSITIES,
  ENTRY_LAYOUTS,
  FONTS,
  HEADING_STYLES,
  LINE_HEIGHTS,
  MARGINS,
  TEMPLATES,
  TEXT_SIZES,
  type ResumeData,
  type ResumeSettings,
} from "@/lib/resume/types"
import { cn } from "@/lib/utils"

const PAPERS = [
  { id: "a4", name: "A4" },
  { id: "letter", name: "US Letter" },
] as const

const GROUPS = [
  { id: "template", name: "Template" },
  { id: "entries", name: "Entries" },
  { id: "type", name: "Type" },
  { id: "color", name: "Color" },
  { id: "page", name: "Page" },
] as const

const FONT_NOTES: Record<ResumeSettings["font"], string> = {
  template: "Each template's own pairing",
  sans: "Plus Jakarta Sans",
  serif: "Source Serif 4",
  mono: "JetBrains Mono",
}

/** Design mode panel: template, type, color and page settings, with a jump bar like a table of contents. */
export function DesignPanel({ data, onChange }: { data: ResumeData; onChange: (value: ResumeSettings) => void }) {
  const value = data.settings
  const update = (partial: Partial<ResumeSettings>) => onChange({ ...value, ...partial })

  return (
    <div>
      <nav
        aria-label="Design sections"
        className="sticky top-0 z-10 flex gap-0.5 border-b bg-background/95 px-3 py-1.5 backdrop-blur"
      >
        {GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#design-${g.id}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(`design-${g.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {g.name}
          </a>
        ))}
      </nav>

      <TemplatePicker data={data} update={update} />

      <Group id="entries" title="Entries">
        <Field label="Header layout">
          <Segmented
            label="Entry header layout"
            value={value.entryLayout}
            options={ENTRY_LAYOUTS}
            onChange={(entryLayout) => update({ entryLayout })}
            className="grid grid-cols-3"
          />
        </Field>
        <Field label="Section headings">
          <Segmented
            label="Section heading style"
            value={value.headingStyle}
            options={HEADING_STYLES}
            onChange={(headingStyle) => update({ headingStyle })}
            className="grid grid-cols-5"
          />
        </Field>
        <Field label="Date format">
          <Select value={value.dateFormat} onValueChange={(v) => update({ dateFormat: v as ResumeSettings["dateFormat"] })}>
            <SelectTrigger className="w-full" aria-label="Date format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Group>

      <Group id="type" title="Type">
        <div role="radiogroup" aria-label="Font" className="grid gap-1.5">
          {FONTS.map((f) => {
            const active = value.font === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ font: f.id })}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "border-primary bg-primary/5 hover:bg-primary/5",
                )}
              >
                <span className={cn("w-8 text-lg font-semibold", f.id !== "template" && FONT_CLASS[f.id])}>Aa</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{f.id === "template" ? "Template default" : f.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{FONT_NOTES[f.id]}</span>
                </span>
                {active && <Check className="size-4 text-primary" />}
              </button>
            )
          })}
        </div>
        <Field label="Density">
          <Segmented
            label="Density"
            value={value.density}
            options={DENSITIES}
            onChange={(density) => update({ density })}
            className="grid grid-cols-3"
          />
          <p className="text-[11px] text-muted-foreground">Sets the space between sections and the line spacing together.</p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Text size">
            <Segmented
              label="Text size"
              value={value.textSize}
              options={TEXT_SIZES}
              onChange={(textSize) => update({ textSize })}
              className="grid grid-cols-4"
            />
          </Field>
          <Field label="Line height">
            <Segmented
              label="Line height"
              value={value.lineHeight}
              options={LINE_HEIGHTS}
              onChange={(lineHeight) => update({ lineHeight })}
              className="grid grid-cols-3 [&>button]:px-1"
            />
          </Field>
        </div>
      </Group>

      <Group id="color" title="Color">
        <AccentPicker value={value.accentColor} onChange={(accentColor) => update({ accentColor })} />
      </Group>

      <Group id="page" title="Page">
        <Field label="Paper">
          <Segmented
            label="Paper size"
            value={value.paperSize}
            options={PAPERS}
            onChange={(paperSize) => update({ paperSize })}
            className="grid grid-cols-2"
          />
        </Field>
        <Field label="Margins">
          <Segmented
            label="Page margins"
            value={value.margins}
            options={MARGINS}
            onChange={(margins) => update({ margins })}
            className="grid grid-cols-3"
          />
        </Field>
        <Toggle
          id="design-icons"
          label="Icons in contact line"
          checked={value.showIcons}
          onChange={(showIcons) => update({ showIcons })}
        />
        <Toggle
          id="design-underline"
          label="Underline links"
          checked={value.underlineLinks}
          onChange={(underlineLinks) => update({ underlineLinks })}
        />
      </Group>

      <div className="p-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => onChange({ ...DEFAULT_SETTINGS, template: value.template, accentColor: value.accentColor })}
        >
          <RotateCcw data-icon="inline-start" /> Reset design defaults
        </Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">Keeps your template and color.</p>
      </div>
    </div>
  )
}

function AccentPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  // Draft keeps partial hex input; the resume only gets valid colors.
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setDraft(value)
  }
  const ratio = contrastRatio(value)

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Accent color" className="grid grid-cols-8 gap-1.5">
        {ACCENT_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            aria-label={c.name}
            title={c.name}
            onClick={() => onChange(c.value)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md text-white ring-offset-2 ring-offset-background transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring",
              value === c.value && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: c.value }}
          >
            {value === c.value && <Check className="size-3.5" strokeWidth={3} />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label
          title="Pick any color"
          className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"
          style={{ backgroundColor: value }}
        >
          <span className="sr-only">Pick any color</span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Input
          aria-label="Accent hex value"
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`
            setDraft(next)
            if (isHexColor(next)) onChange(next.toLowerCase())
          }}
          onBlur={() => setDraft(value)}
          aria-invalid={!isHexColor(draft) || undefined}
          className="font-mono uppercase"
        />
        <span
          title="Contrast against the white page"
          className={cn(
            "shrink-0 rounded-md px-2 py-1 font-mono text-xs font-semibold",
            ratio >= 4.5 ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
          )}
        >
          {ratio.toFixed(1)}:1
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        The accent colors headings, rules and links. Body text stays near-black for print and ATS.
        {ratio < 4.5 && " This color is hard to read on white; pick a darker one."}
      </p>
    </div>
  )
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`design-${id}`} aria-labelledby={`design-${id}-title`} className="scroll-mt-12 space-y-3 border-b px-4 py-5">
      <h2 id={`design-${id}-title`} className="text-sm font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      {label}
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
    </label>
  )
}

const LAYOUT_FILTERS = [
  { id: "all", name: "All" },
  { id: "1", name: "One column" },
  { id: "2", name: "Two columns" },
] as const

function TemplatePicker({ data, update }: { data: ResumeData; update: (partial: Partial<ResumeSettings>) => void }) {
  const value = data.settings
  const [filter, setFilter] = useState<(typeof LAYOUT_FILTERS)[number]["id"]>("all")
  const shown = TEMPLATES.filter((t) => filter === "all" || String(t.columns) === filter)
  const twoColumn = TEMPLATES.find((t) => t.id === value.template)?.columns === 2

  return (
    <Group id="template" title="Template">
      <Segmented label="Filter templates" value={filter} options={LAYOUT_FILTERS} onChange={setFilter} className="grid grid-cols-3" />
      <div role="radiogroup" aria-label="Template" className="grid grid-cols-2 gap-3">
        {shown.map((t) => {
          const active = value.template === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => update({ template: t.id })}
              className="group text-left outline-none"
            >
              <span
                className={cn(
                  "relative block h-44 overflow-hidden rounded-lg bg-white ring-1 ring-border transition group-hover:ring-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                  active && "ring-2 ring-primary group-hover:ring-primary",
                )}
              >
                <ResumeThumbnail data={{ ...data, settings: { ...value, template: t.id } }} />
                {active && (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-sm font-semibold">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.columns === 2 ? "Two columns" : "One column · ATS-friendly"}</span>
            </button>
          )
        })}
      </div>
      {twoColumn && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sidebar">
            <Segmented
              label="Sidebar side"
              value={value.sidebarSide}
              options={[
                { id: "left", name: "Left" },
                { id: "right", name: "Right" },
              ]}
              onChange={(sidebarSide) => update({ sidebarSide })}
              className="grid grid-cols-2"
            />
          </Field>
          <Field label={`Width · ${value.sidebarWidth}%`}>
            <input
              type="range"
              min={25}
              max={45}
              step={1}
              value={value.sidebarWidth}
              aria-label="Sidebar width"
              onChange={(e) => update({ sidebarWidth: Number(e.target.value) })}
              className="h-7 w-full accent-primary"
            />
          </Field>
          <p className="col-span-2 text-xs text-muted-foreground">
            Choose which sections sit in the sidebar from each section&apos;s menu in Write.
          </p>
        </div>
      )}
    </Group>
  )
}
