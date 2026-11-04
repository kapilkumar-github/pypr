import {
  DENSITIES,
  LINE_HEIGHTS,
  MARGINS,
  TEMPLATES,
  TEXT_SIZES,
  type ResumeData,
  type TemplateId,
} from "@/lib/resume/types"
import { cn } from "@/lib/utils"
import { ContactList, ResumeSections, type TemplateStyle } from "./sections"

// Resume paper is print media: a fixed light palette regardless of the app theme.

export const FONT_CLASS = { sans: "font-sans", serif: "font-serif", mono: "font-mono" } as const

const factor = <T extends { id: string; factor: number }>(list: readonly T[], id: string) =>
  list.find((x) => x.id === id)?.factor ?? 1

/** CSS variables for the paper: gaps (`--density`), page padding (`--margin`), line height (`--lh`). */
export function pageStyle(data: ResumeData) {
  const s = data.settings
  return {
    "--density": factor(DENSITIES, s.density),
    "--margin": factor(MARGINS, s.margins),
    // Line height setting, tightened or loosened by density.
    "--lh": (LINE_HEIGHTS.find((l) => l.id === s.lineHeight)?.value ?? 1.6) * (DENSITIES.find((d) => d.id === s.density)?.line ?? 1),
  } as React.CSSProperties
}

/** Template root: typeface (template's own unless the user picked one), text size, link underline. */
function Root({ data, font, className, children }: { data: ResumeData; font: string; className?: string; children: React.ReactNode }) {
  const f = data.settings.font
  return (
    <div
      className={cn(
        f === "template" ? font : FONT_CLASS[f],
        // Titles, dates and contact lines follow the line height too, a little tighter than body text.
        "leading-[calc(var(--lh,1.6)*0.9)]",
        data.settings.underlineLinks ? "[&_a]:underline [&_a]:underline-offset-2" : "[&_a]:no-underline",
        className,
      )}
      style={{ zoom: factor(TEXT_SIZES, data.settings.textSize) }}
    >
      {children}
    </div>
  )
}

const body = "text-[12px] leading-[var(--lh,1.6)] text-slate-700"
const gap = "space-y-[calc(var(--density,1)*1rem)]"

function Modern({ data }: { data: ResumeData }) {
  const accent = data.settings.accentColor
  const p = data.personalInfo
  const style: TemplateStyle = {
    heading: (t) => (
      <h2
        className="mb-2 border-b pb-1 text-[11px] font-bold tracking-wider uppercase"
        style={{ color: accent, borderColor: `${accent}33` }}
      >
        {t}
      </h2>
    ),
    itemTitle: "text-[13px] font-bold text-slate-900",
    itemMeta: "text-[11px] text-slate-500",
    body,
    sectionGap: gap,
  }
  return (
    <Root data={data} font="font-sans">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: accent }}>
          {p.fullName || "Your Name"}
        </h1>
        {p.jobTitle && <p className="mt-0.5 text-base font-semibold text-slate-600">{p.jobTitle}</p>}
        <ContactList data={data} separator="•" className="mt-2 text-[11px] text-slate-600" />
      </header>
      <div className="mt-4">
        <ResumeSections data={data} style={style} />
      </div>
    </Root>
  )
}

function Classic({ data }: { data: ResumeData }) {
  const accent = data.settings.accentColor
  const p = data.personalInfo
  const style: TemplateStyle = {
    heading: (t) => (
      <h2 className="mb-2 flex items-center gap-3 text-[13px] font-semibold tracking-[0.18em] text-slate-900 uppercase">
        {t}
        <span className="h-px flex-1" style={{ backgroundColor: accent }} />
      </h2>
    ),
    itemTitle: "text-[13px] font-bold text-slate-900",
    itemMeta: "text-[11px] italic text-slate-500",
    body: cn(body, "text-slate-800"),
    sectionGap: gap,
  }
  return (
    <Root data={data} font="font-serif">
      <header className="pb-4 text-center">
        <h1 className="text-3xl font-semibold tracking-wide text-slate-900">{p.fullName || "Your Name"}</h1>
        {p.jobTitle && (
          <p className="mt-1 text-sm tracking-widest uppercase" style={{ color: accent }}>
            {p.jobTitle}
          </p>
        )}
        <ContactList data={data} separator="|" className="mt-2 justify-center text-[11px] text-slate-600" />
      </header>
      <ResumeSections data={data} style={style} />
    </Root>
  )
}

function Minimal({ data }: { data: ResumeData }) {
  const accent = data.settings.accentColor
  const p = data.personalInfo
  const style: TemplateStyle = {
    heading: (t) => <h2 className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{t}</h2>,
    itemTitle: "text-[13px] font-semibold text-slate-900",
    itemMeta: "text-[11px] text-slate-500",
    body,
    sectionGap: "space-y-[calc(var(--density,1)*1.25rem)]",
    skillSeparator: " · ",
  }
  return (
    <Root data={data} font="font-sans">
      <header className="pb-5">
        <h1 className="text-4xl font-light tracking-tight text-slate-900">{p.fullName || "Your Name"}</h1>
        {p.jobTitle && (
          <p className="mt-1 text-sm font-medium" style={{ color: accent }}>
            {p.jobTitle}
          </p>
        )}
        <ContactList data={data} separator="·" className="mt-2 text-[11px] text-slate-500" />
      </header>
      <ResumeSections data={data} style={style} />
    </Root>
  )
}

/** Accent band header with white name; bold small-caps headings. */
function Executive({ data }: { data: ResumeData }) {
  const accent = data.settings.accentColor
  const p = data.personalInfo
  const style: TemplateStyle = {
    heading: (t) => (
      <h2 className="mb-2 flex items-center gap-2 text-[12px] font-extrabold tracking-[0.14em] text-slate-900 uppercase">
        <span className="h-3 w-1 rounded-full" style={{ backgroundColor: accent }} />
        {t}
      </h2>
    ),
    itemTitle: "text-[13px] font-bold text-slate-900",
    itemMeta: "text-[11px] text-slate-500",
    body,
    sectionGap: gap,
  }
  return (
    <Root data={data} font="font-sans">
      <header className="mb-5 rounded-sm px-6 py-5 text-white" style={{ backgroundColor: accent }}>
        <h1 className="text-3xl font-extrabold tracking-tight">{p.fullName || "Your Name"}</h1>
        {p.jobTitle && <p className="mt-0.5 text-sm font-medium opacity-90">{p.jobTitle}</p>}
        <ContactList data={data} separator="·" className="mt-2.5 text-[11px] opacity-90" />
      </header>
      <ResumeSections data={data} style={style} />
    </Root>
  )
}

function columnsStyle(data: ResumeData) {
  const w = `${data.settings.sidebarWidth}%`
  return { gridTemplateColumns: data.settings.sidebarSide === "left" ? `${w} 1fr` : `1fr ${w}` }
}

/** Tinted sidebar holding name, contact and side sections; main column on the other side. */
function Sidebar({ data }: { data: ResumeData }) {
  const accent = data.settings.accentColor
  const p = data.personalInfo
  const left = data.settings.sidebarSide === "left"
  const style: TemplateStyle = {
    heading: (t) => (
      <h2 className="mb-2 text-[11px] font-bold tracking-wider uppercase" style={{ color: accent }}>
        {t}
      </h2>
    ),
    itemTitle: "text-[13px] font-bold text-slate-900",
    itemMeta: "text-[11px] text-slate-500",
    body,
    sectionGap: gap,
  }
  const side = (
    <aside className={cn("rounded-md p-4", left ? "order-1" : "order-2")} style={{ backgroundColor: `${accent}12` }}>
      <h1 className="text-2xl leading-tight font-extrabold text-slate-900">{p.fullName || "Your Name"}</h1>
      {p.jobTitle && (
        <p className="mt-1 text-[13px] font-semibold" style={{ color: accent }}>
          {p.jobTitle}
        </p>
      )}
      <ContactList data={data} separator="" stacked className="mt-3 mb-5 text-[11px] text-slate-600" />
      <ResumeSections data={data} style={{ ...style, skillSeparator: " · " }} column="side" />
    </aside>
  )
  return (
    <Root data={data} font="font-sans">
      <div className="grid gap-6" style={columnsStyle(data)}>
        {side}
        <main className={cn("min-w-0", left ? "order-2" : "order-1")}>
          <ResumeSections data={data} style={style} column="main" />
        </main>
      </div>
    </Root>
  )
}

/** Full-width header, then two columns split by a hairline. */
function Split({ data }: { data: ResumeData }) {
  const accent = data.settings.accentColor
  const p = data.personalInfo
  const left = data.settings.sidebarSide === "left"
  const style: TemplateStyle = {
    heading: (t) => (
      <h2 className="mb-2 text-[12px] font-bold tracking-wide text-slate-900 uppercase">
        <span className="border-b-2 pb-0.5" style={{ borderColor: accent }}>
          {t}
        </span>
      </h2>
    ),
    itemTitle: "text-[13px] font-bold text-slate-900",
    itemMeta: "text-[11px] text-slate-500",
    body,
    sectionGap: gap,
  }
  return (
    <Root data={data} font="font-sans">
      <header className="mb-5 flex items-end justify-between gap-6 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{p.fullName || "Your Name"}</h1>
          {p.jobTitle && (
            <p className="mt-0.5 text-sm font-semibold" style={{ color: accent }}>
              {p.jobTitle}
            </p>
          )}
        </div>
        <ContactList data={data} separator="" stacked className="max-w-[45%] text-right text-[11px] text-slate-600 [&>span]:justify-end" />
      </header>
      <div className="grid gap-6" style={columnsStyle(data)}>
        <aside className={cn("min-w-0", left ? "order-1 border-r pr-6" : "order-2 border-l pl-6", "border-slate-200")}>
          <ResumeSections data={data} style={{ ...style, skillSeparator: " · " }} column="side" />
        </aside>
        <main className={cn("min-w-0", left ? "order-2" : "order-1")}>
          <ResumeSections data={data} style={style} column="main" />
        </main>
      </div>
    </Root>
  )
}

const templates: Record<TemplateId, (props: { data: ResumeData }) => React.ReactNode> = {
  modern: Modern,
  classic: Classic,
  minimal: Minimal,
  executive: Executive,
  sidebar: Sidebar,
  split: Split,
}

export const isTwoColumn = (id: TemplateId) => TEMPLATES.find((t) => t.id === id)?.columns === 2

export function ResumeTemplate({ data }: { data: ResumeData }) {
  const Template = templates[data.settings.template] ?? Modern
  return <Template data={data} />
}
