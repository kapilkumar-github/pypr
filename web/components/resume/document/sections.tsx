import { Globe, Link2, Mail, MapPin, Phone } from "lucide-react"

import { contacts, type ContactKind } from "@/lib/resume/contact"
import { displayUrl, formatMonth, formatRange, httpsUrl, isRichTextEmpty, splitSkills } from "@/lib/resume/format"
import { sectionEntries, sectionTitle } from "@/lib/resume/sections"
import type {
  AwardItem,
  CertificationItem,
  CustomItem,
  EducationItem,
  ExperienceItem,
  InterestItem,
  LanguageItem,
  ProjectItem,
  PublicationItem,
  ReferenceItem,
  ResumeData,
  RichText,
  SectionMeta,
  SkillCategory,
  VolunteerItem,
} from "@/lib/resume/types"
import { cn } from "@/lib/utils"
import { RichTextView } from "./rich-text-view"

/** Visual knobs a template supplies; section content and order come from the resume. */
export type TemplateStyle = {
  heading: (title: string) => React.ReactNode
  itemTitle: string
  itemMeta: string
  body: string
  sectionGap: string
  /** Separator between skills in a group. */
  skillSeparator?: string
}

type Ctx = {
  data: ResumeData
  style: TemplateStyle
  heading: (title: string) => React.ReactNode
  /** Narrow column: entries always stack. */
  narrow: boolean
}

/** The template's heading unless the user picked a heading style in Design. */
function SectionHeading({ data, style, title }: { data: ResumeData; style: TemplateStyle; title: string }) {
  const accent = data.settings.accentColor
  const base = "mb-[calc(var(--density,1)*0.5rem)] text-[12px] font-bold tracking-wider uppercase"
  switch (data.settings.headingStyle) {
    case "plain":
      return (
        <h2 className={base} style={{ color: accent }}>
          {title}
        </h2>
      )
    case "rule":
      return (
        <h2 className={cn(base, "border-b-[1.5px] pb-0.5")} style={{ color: accent, borderColor: accent }}>
          {title}
        </h2>
      )
    case "bar":
      return (
        <h2 className={cn(base, "border-l-[3px] pl-2 text-slate-900")} style={{ borderColor: accent }}>
          {title}
        </h2>
      )
    case "band":
      return (
        <h2 className={cn(base, "rounded-sm px-2 py-0.5 text-slate-900")} style={{ backgroundColor: `${accent}1f` }}>
          {title}
        </h2>
      )
    default:
      return style.heading(title)
  }
}

/** Visible sections in print order; `column` limits them to one column of a two-column template. */
export function ResumeSections({
  data,
  style,
  column,
}: {
  data: ResumeData
  style: TemplateStyle
  column?: SectionMeta["column"]
}) {
  const ctx: Ctx = {
    data,
    style,
    heading: (title) => <SectionHeading data={data} style={style} title={title} />,
    narrow: column === "side",
  }
  const metas = data.sections.filter((m) => !m.hidden && (column === undefined || m.column === column))
  return (
    <div className={style.sectionGap}>
      {metas.map((m) => (
        <Section key={m.id} meta={m} ctx={ctx} />
      ))}
    </div>
  )
}

function Section({ meta, ctx }: { meta: SectionMeta; ctx: Ctx }) {
  const content = sectionContent(meta, ctx)
  if (!content) return null
  return (
    <section className={cn("resume-section", meta.pageBreak && "break-before-page")}>
      {!meta.hideHeading && ctx.heading(sectionTitle(meta))}
      {content}
    </section>
  )
}

function sectionContent(meta: SectionMeta, ctx: Ctx): React.ReactNode {
  const { data, style } = ctx
  if (meta.id === "summary") {
    const summary = data.personalInfo.summary
    return isRichTextEmpty(summary) ? null : <RichTextView value={summary} className={style.body} />
  }
  const entries = sectionEntries(data, meta.id).filter((e) => !e.hidden)
  if (entries.length === 0) return null
  const fmt = data.settings.dateFormat
  const render = (e: (typeof entries)[number]): React.ReactNode => {
    switch (meta.id) {
      case "experience": {
        const x = e as unknown as ExperienceItem
        return (
          <Entry ctx={ctx} title={x.position} subtitle={x.company} date={formatRange(x.startDate, x.endDate, x.current, fmt)} place={x.location} url={x.url} description={x.description} />
        )
      }
      case "projects": {
        const x = e as unknown as ProjectItem
        return <Entry ctx={ctx} title={x.name} subtitle={x.role} date={formatRange(x.startDate, x.endDate, false, fmt)} url={x.url} description={x.description} />
      }
      case "education": {
        const x = e as unknown as EducationItem
        const degree = [x.degree, x.field].filter(Boolean).join(", ") + (x.gpa ? ` · GPA ${x.gpa}` : "")
        return (
          <Entry ctx={ctx} title={x.institution} subtitle={degree} date={formatRange(x.startDate, x.endDate, false, fmt)} place={[x.honors, x.location].filter(Boolean).join(" · ")} />
        )
      }
      case "skills": {
        const x = e as unknown as SkillCategory
        if (!x.name.trim() && !x.skills.trim()) return null
        return (
          <p className={style.body}>
            {x.name && <span className="font-semibold text-slate-900">{x.name}: </span>}
            {splitSkills(x.skills).join(style.skillSeparator ?? ", ")}
          </p>
        )
      }
      case "certifications": {
        const x = e as unknown as CertificationItem
        return <Entry ctx={ctx} title={x.name} subtitle={x.issuer} date={formatMonth(x.date, fmt)} url={x.url} line />
      }
      case "languages": {
        const x = e as unknown as LanguageItem
        return (
          <p className={style.body}>
            <span className="font-semibold text-slate-900">{x.name}</span>
            {x.level && <span> · {x.level}</span>}
          </p>
        )
      }
      case "interests": {
        const x = e as unknown as InterestItem
        return (
          <p className={style.body}>
            <span className="font-semibold text-slate-900">{x.name}</span>
            {x.keywords && <span>: {splitSkills(x.keywords).join(style.skillSeparator ?? ", ")}</span>}
          </p>
        )
      }
      case "awards": {
        const x = e as unknown as AwardItem
        return <Entry ctx={ctx} title={x.title} subtitle={x.awarder} date={formatMonth(x.date, fmt)} description={x.description} />
      }
      case "publications": {
        const x = e as unknown as PublicationItem
        return <Entry ctx={ctx} title={x.name} subtitle={x.publisher} date={formatMonth(x.date, fmt)} url={x.url} description={x.description} />
      }
      case "volunteer": {
        const x = e as unknown as VolunteerItem
        return (
          <Entry ctx={ctx} title={x.position} subtitle={x.organization} date={formatRange(x.startDate, x.endDate, false, fmt)} place={x.location} description={x.description} />
        )
      }
      case "references": {
        const x = e as unknown as ReferenceItem
        return <Entry ctx={ctx} title={x.name} subtitle={x.relationship} place={x.contact} description={x.description} />
      }
      default: {
        const x = e as unknown as CustomItem
        return <Entry ctx={ctx} title={x.title} subtitle={x.subtitle} date={formatMonth(x.date, fmt)} url={x.url} description={x.description} />
      }
    }
  }
  const compactList = ["skills", "languages", "interests", "certifications"].includes(meta.id)
  return (
    <div
      className={cn(
        meta.columns === 2
          ? "grid grid-cols-2 gap-x-6 gap-y-[calc(var(--density,1)*0.5rem)]"
          : compactList
            ? "space-y-[calc(var(--density,1)*0.25rem)]"
            : "space-y-[calc(var(--density,1)*0.75rem)]",
      )}
    >
      {entries.map((e) => (
        <div key={e.id} className="resume-item">
          {render(e)}
        </div>
      ))}
    </div>
  )
}

/** One entry's header (title, organization, date, place, link) laid out per Design → Entries, then its description. */
function Entry({
  ctx,
  title,
  subtitle,
  date,
  place,
  url,
  description,
  line,
}: {
  ctx: Ctx
  title: string
  subtitle?: string
  date?: string
  place?: string
  url?: string
  description?: RichText
  /** Short single-line entry (certifications). */
  line?: boolean
}) {
  const { style, data } = ctx
  const layout = ctx.narrow ? "stacked" : line ? "split" : data.settings.entryLayout
  const link = url ? (
    <a href={httpsUrl(url)} target="_blank" rel="noopener noreferrer">
      {displayUrl(url)}
    </a>
  ) : null
  const head =
    layout === "stacked" ? (
      <>
        <p className={style.itemTitle}>{title}</p>
        {subtitle && <p className={cn(style.body, "font-medium")}>{subtitle}</p>}
        <Meta className={style.itemMeta} parts={[date, place]} link={link} />
      </>
    ) : layout === "compact" ? (
      <div className="flex items-baseline justify-between gap-3">
        <p className={style.itemTitle}>
          {title}
          {subtitle && <span className="font-medium"> · {subtitle}</span>}
          {place && <span className={cn(style.itemMeta, "font-normal")}> · {place}</span>}
        </p>
        {date && <p className={cn(style.itemMeta, "shrink-0")}>{date}</p>}
      </div>
    ) : (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <p className={style.itemTitle}>
            {title}
            {subtitle && <span className="font-medium"> · {subtitle}</span>}
          </p>
          {date && <p className={cn(style.itemMeta, "shrink-0")}>{date}</p>}
        </div>
        {!line && <Meta className={style.itemMeta} parts={[place]} link={link} />}
      </>
    )
  return (
    <>
      {head}
      {line && layout === "split" && link && <p className={style.itemMeta}>{link}</p>}
      {layout === "compact" && link && <p className={style.itemMeta}>{link}</p>}
      {description && !isRichTextEmpty(description) && <RichTextView value={description} className={cn(style.body, "mt-1")} />}
    </>
  )
}

function Meta({ className, parts, link }: { className: string; parts: (string | undefined)[]; link: React.ReactNode }) {
  const text = parts.filter(Boolean).join(" · ")
  if (!text && !link) return null
  return (
    <p className={className}>
      {text}
      {text && link && " · "}
      {link}
    </p>
  )
}

const CONTACT_ICONS: Record<ContactKind, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  phone: Phone,
  location: MapPin,
  website: Globe,
  link: Link2,
}

export function ContactList({
  data,
  separator,
  className,
  stacked,
}: {
  data: ResumeData
  separator: string
  className: string
  /** One item per line (sidebars). */
  stacked?: boolean
}) {
  const items = contacts(data)
  const icons = data.settings.showIcons
  return (
    <div className={cn(className, stacked ? "space-y-0.5" : "flex flex-wrap items-center gap-x-1")}>
      {items.map((c, i) => (
        <span key={i} className={cn(stacked ? "flex" : "inline-flex", "items-center gap-1 break-all")}>
          {!stacked && !icons && i > 0 && <span aria-hidden>{separator} </span>}
          {icons && <ContactIcon kind={c.kind} />}
          {c.href ? (
            <a href={c.href} target="_blank" rel="noopener noreferrer">
              {c.label}
            </a>
          ) : (
            c.label
          )}
          {!stacked && icons && <span className="w-1.5" aria-hidden />}
        </span>
      ))}
    </div>
  )
}

function ContactIcon({ kind }: { kind: ContactKind }) {
  const Icon = CONTACT_ICONS[kind]
  return <Icon className="size-[1.05em] shrink-0 opacity-70" />
}
