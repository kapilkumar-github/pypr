import { contactLines } from "./contact"
import { displayUrl, formatMonth, formatRange, splitSkills } from "./format"
import { sectionEntries, sectionTitle } from "./sections"
import type { ResumeData, RichText } from "./types"

type Node = { type?: string; text?: string; content?: Node[] }

/** Tiptap JSON as lines: paragraphs as-is, list items flagged as bullets. */
export function richTextLines(value: RichText): { text: string; bullet: boolean }[] {
  const lines: { text: string; bullet: boolean }[] = []
  const inline = (n: Node): string => (n.text ?? "") + (n.content ?? []).map(inline).join("")
  const walk = (n: Node, bullet: boolean) => {
    if (n.type === "paragraph") {
      const text = inline(n).trim()
      if (text) lines.push({ text, bullet })
      return
    }
    for (const child of n.content ?? []) walk(child, bullet || n.type === "listItem")
  }
  if (value) walk(value as Node, false)
  return lines
}

/** Tiptap JSON to plain text: one line per paragraph, "• " for list items. */
export function richTextToPlain(value: RichText): string {
  return richTextLines(value)
    .map((l) => (l.bullet ? `• ${l.text}` : l.text))
    .join("\n")
}

export type OutlineEntry = {
  title: string
  subtitle: string
  date: string
  place: string
  url: string
  lines: { text: string; bullet: boolean }[]
}

export type Outline = {
  name: string
  headline: string
  contacts: string[]
  sections: { id: string; title: string; entries: OutlineEntry[] }[]
}

const s = (v: unknown) => (typeof v === "string" ? v : "")

/** The visible resume as structured text, in print order. Shared by every text export and the ATS checks. */
export function resumeOutline(d: ResumeData): Outline {
  const fmt = d.settings.dateFormat
  const sections: Outline["sections"] = []
  for (const meta of d.sections) {
    if (meta.hidden) continue
    let entries: OutlineEntry[]
    if (meta.id === "summary") {
      const lines = richTextLines(d.personalInfo.summary)
      entries = lines.length ? [{ title: "", subtitle: "", date: "", place: "", url: "", lines }] : []
    } else {
      entries = sectionEntries(d, meta.id)
        .filter((e) => !e.hidden)
        .map((e): OutlineEntry => {
          const range = formatRange(s(e.startDate), s(e.endDate), e.current === true, fmt)
          const month = formatMonth(s(e.date), fmt)
          const lines = richTextLines((e.description ?? null) as RichText)
          const base = { date: "", place: "", url: s(e.url), lines }
          switch (meta.id) {
            case "experience":
              return { ...base, title: s(e.position), subtitle: s(e.company), date: range, place: s(e.location) }
            case "projects":
              return { ...base, title: s(e.name), subtitle: s(e.role), date: range }
            case "education":
              return {
                ...base,
                title: s(e.institution),
                subtitle: [s(e.degree), s(e.field)].filter(Boolean).join(", ") + (s(e.gpa) ? ` · GPA ${s(e.gpa)}` : ""),
                date: range,
                place: [s(e.honors), s(e.location)].filter(Boolean).join(" · "),
              }
            case "skills":
              return { ...base, title: s(e.name), subtitle: splitSkills(s(e.skills)).join(", ") }
            case "certifications":
              return { ...base, title: s(e.name), subtitle: s(e.issuer), date: month }
            case "languages":
              return { ...base, title: s(e.name), subtitle: s(e.level) }
            case "interests":
              return { ...base, title: s(e.name), subtitle: splitSkills(s(e.keywords)).join(", ") }
            case "awards":
              return { ...base, title: s(e.title), subtitle: s(e.awarder), date: month }
            case "publications":
              return { ...base, title: s(e.name), subtitle: s(e.publisher), date: month }
            case "volunteer":
              return { ...base, title: s(e.position), subtitle: s(e.organization), date: range, place: s(e.location) }
            case "references":
              return { ...base, title: s(e.name), subtitle: s(e.relationship), place: s(e.contact) }
            default:
              return { ...base, title: s(e.title), subtitle: s(e.subtitle), date: month }
          }
        })
        .filter((e) => e.title || e.subtitle || e.lines.length)
    }
    if (entries.length) sections.push({ id: meta.id, title: sectionTitle(meta), entries })
  }
  const p = d.personalInfo
  return { name: p.fullName, headline: p.jobTitle, contacts: contactLines(d), sections }
}

const entryHead = (e: OutlineEntry, sep: string) => [e.title, e.subtitle].filter(Boolean).join(sep)

/** Whole resume as plain text, for pasting into application forms. */
export function resumeToPlainText(d: ResumeData): string {
  const o = resumeOutline(d)
  const out = [[o.name, o.headline, o.contacts.join(" | ")].filter(Boolean).join("\n")]
  for (const sec of o.sections) {
    const body = sec.entries.map((e) =>
      [
        [entryHead(e, ", "), e.date && `(${e.date})`].filter(Boolean).join(" "),
        e.place,
        e.url && displayUrl(e.url),
        ...e.lines.map((l) => (l.bullet ? `• ${l.text}` : l.text)),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    out.push(`${sec.title.toUpperCase()}\n${body.join("\n\n")}`)
  }
  return out.filter(Boolean).join("\n\n") + "\n"
}

const mdEscape = (t: string) => t.replace(/([\\`*_[\]#<>|])/g, "\\$1")

/** Markdown with headings, for application forms and docs that accept it. */
export function resumeToMarkdown(d: ResumeData): string {
  const o = resumeOutline(d)
  const out: string[] = [`# ${mdEscape(o.name || "Resume")}`]
  if (o.headline) out.push(`**${mdEscape(o.headline)}**`)
  if (o.contacts.length) out.push(o.contacts.map(mdEscape).join(" · "))
  for (const sec of o.sections) {
    out.push(`## ${mdEscape(sec.title)}`)
    for (const e of sec.entries) {
      const head = entryHead(e, " — ")
      const block: string[] = []
      if (head) block.push(`### ${mdEscape(head)}`)
      const meta = [e.date, e.place, e.url && displayUrl(e.url)].filter(Boolean).map(mdEscape).join(" · ")
      if (meta) block.push(`*${meta}*`)
      for (const l of e.lines) block.push(l.bullet ? `- ${mdEscape(l.text)}` : mdEscape(l.text))
      out.push(block.join("\n\n").replace(/\n\n- /g, "\n- "))
    }
  }
  return out.join("\n\n") + "\n"
}

const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Simple, editable HTML that Word and LibreOffice open as a document (.doc). */
export function resumeToWordHtml(d: ResumeData): string {
  const o = resumeOutline(d)
  const accent = d.settings.accentColor
  const parts: string[] = [
    `<h1 style="margin:0;font-size:22pt">${html(o.name || "Resume")}</h1>`,
    o.headline ? `<p style="margin:2pt 0;font-size:12pt;color:${accent}">${html(o.headline)}</p>` : "",
    o.contacts.length ? `<p style="margin:2pt 0 10pt;font-size:9pt;color:#475569">${o.contacts.map(html).join(" · ")}</p>` : "",
  ]
  for (const sec of o.sections) {
    parts.push(`<h2 style="font-size:11pt;text-transform:uppercase;color:${accent};border-bottom:1px solid ${accent};margin:12pt 0 4pt">${html(sec.title)}</h2>`)
    for (const e of sec.entries) {
      const head = entryHead(e, " · ")
      if (head || e.date) {
        parts.push(
          `<p style="margin:6pt 0 0"><b>${html(head)}</b>${e.date ? `<span style="color:#64748b"> &nbsp; ${html(e.date)}</span>` : ""}</p>`,
        )
      }
      const meta = [e.place, e.url && displayUrl(e.url)].filter(Boolean).join(" · ")
      if (meta) parts.push(`<p style="margin:0;font-size:9pt;color:#64748b">${html(meta)}</p>`)
      const bullets = e.lines.filter((l) => l.bullet)
      for (const l of e.lines.filter((l) => !l.bullet)) parts.push(`<p style="margin:2pt 0">${html(l.text)}</p>`)
      if (bullets.length) parts.push(`<ul style="margin:2pt 0">${bullets.map((l) => `<li>${html(l.text)}</li>`).join("")}</ul>`)
    }
  }
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${html(o.name || "Resume")}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:10.5pt;color:#1e293b">${parts.join("")}</body></html>`
}
