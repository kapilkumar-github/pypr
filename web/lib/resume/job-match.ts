import { resumeToPlainText } from "./plain-text"
import { SKILLS, type SkillDef } from "./skills"
import type { ResumeData } from "./types"

/** One thing a posting asks for, with the spellings that count as a match. */
export type Requirement = { name: string; aliases: string[]; exact: string[]; required: boolean }

/** A posting's requirements, read instantly by rules or by the AI (`POST /api/job-analyses`). */
export type JobRequirements = {
  source: "rules" | "ai"
  title: string
  minYears: number
  items: Requirement[]
}

/** The API's AI analysis. */
export type AiRequirements = {
  title: string
  seniority: string
  minYears: number
  required: { name: string; aliases: string[] }[]
  niceToHave: { name: string; aliases: string[] }[]
}

export type ResumeMatch = {
  /** 0–100: required items count double. */
  score: number
  covered: Requirement[]
  missing: Requirement[]
  /** Years of experience from the resume's dated roles, or null without dates. */
  years: number | null
}

/** Lowercase words with punctuation as spaces, padded, so " node js " finds the phrase "node js". */
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim()} `

const NICE_HEADING = /nice[\s-]*to[\s-]*have|preferred|bonus|good[\s-]*to[\s-]*have|desirable|\bplus\b|optional/i
const REQUIRED_HEADING = /required|requirements|must[\s-]*have|qualifications|what you.?ll need|responsibilit|you have|skills/i

/** Instant reading: dictionary skills found in the posting, split by its "Nice to have" headings. */
export function readPosting(posting: string): JobRequirements {
  const found = new Map<string, Requirement>()
  let nice = false
  for (const line of posting.split(/\n+/)) {
    // A short line naming a section switches between must-haves and nice-to-haves.
    if (line.length < 80 && NICE_HEADING.test(line)) nice = true
    else if (line.length < 80 && REQUIRED_HEADING.test(line)) nice = false
    const text = norm(line)
    for (const def of SKILLS) {
      if (!mentions(text, line, def)) continue
      const prev = found.get(def.name)
      if (!prev) found.set(def.name, toRequirement(def, !nice))
      else if (!nice) prev.required = true
    }
  }
  // "Apollo GraphQL" also mentions "GraphQL"; keep both, they're separate skills.
  return {
    source: "rules",
    title: "",
    minYears: minYears(posting),
    items: [...found.values()].sort((a, b) => Number(b.required) - Number(a.required)),
  }
}

/** AI requirements, with dictionary spellings added for skills it names. */
export function fromAi(ai: AiRequirements): JobRequirements {
  const item = (s: { name: string; aliases: string[] }, required: boolean): Requirement => {
    const def = SKILLS.find((d) => [d.name, ...(d.aliases ?? [])].some((n) => norm(n) === norm(s.name)))
    return {
      name: s.name,
      aliases: [...new Set([...s.aliases, ...(def ? [def.name, ...(def.aliases ?? [])] : [])])],
      exact: def?.exact ?? [],
      required,
    }
  }
  return {
    source: "ai",
    title: [ai.seniority && !ai.title.includes(ai.seniority) ? ai.seniority : "", ai.title].filter(Boolean).join(" "),
    minYears: ai.minYears,
    items: [...ai.required.map((s) => item(s, true)), ...ai.niceToHave.map((s) => item(s, false))],
  }
}

export function matchResume(data: ResumeData, req: JobRequirements): ResumeMatch {
  const raw = resumeToPlainText(data)
  const text = norm(raw)
  const covered: Requirement[] = []
  const missing: Requirement[] = []
  for (const r of req.items) (mentions(text, raw, r) ? covered : missing).push(r)
  const weight = (list: Requirement[]) => list.reduce((n, r) => n + (r.required ? 2 : 1), 0)
  const total = weight(req.items)
  return { score: total ? Math.round((weight(covered) / total) * 100) : 0, covered, missing, years: experienceYears(data) }
}

function toRequirement(def: SkillDef, required: boolean): Requirement {
  return { name: def.name, aliases: def.aliases ?? [], exact: def.exact ?? [], required }
}

/** Whether normalized text (or, for exact spellings, the raw text) mentions the skill. */
function mentions(text: string, raw: string, s: { name: string; aliases?: string[]; exact?: string[] }): boolean {
  const names = s.exact?.length ? (s.aliases ?? []) : [s.name, ...(s.aliases ?? [])]
  for (const n of names) {
    const k = norm(n).trim()
    if (!k) continue
    // Also accept a plural ("unit tests") or a dropped plural ("REST API" for "REST APIs").
    if (text.includes(` ${k} `) || text.includes(` ${k}s `) || (k.endsWith("s") && text.includes(` ${k.slice(0, -1)} `))) return true
  }
  return (s.exact ?? []).some((e) => new RegExp(`(^|[^A-Za-z0-9])${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9#+]|$)`).test(raw))
}

function minYears(posting: string): number {
  const years = [...posting.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)/gi)].map((m) => Number(m[1]))
  return years.length ? Math.min(...years) : 0
}

/** Total years covered by dated experience entries, overlapping roles counted once. */
export function experienceYears(data: ResumeData): number | null {
  const month = (d: string) => (/^\d{4}-\d{2}$/.test(d) ? Number(d.slice(0, 4)) * 12 + Number(d.slice(5)) - 1 : null)
  const now = new Date()
  const spans = data.experience
    .map((e) => [month(e.startDate), e.current ? now.getFullYear() * 12 + now.getMonth() : month(e.endDate)] as const)
    .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null && s[1] >= s[0])
    .sort((a, b) => a[0] - b[0])
  if (!spans.length) return null
  let total = 0
  let [start, end] = spans[0]!
  for (const [s, e] of spans.slice(1)) {
    if (s <= end) end = Math.max(end, e)
    else {
      total += end - start
      ;[start, end] = [s, e]
    }
  }
  total += end - start
  return Math.round((total / 12) * 10) / 10
}
