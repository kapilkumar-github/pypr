import { jobKey, parseUrl } from "./urlpattern"
import { collapse, htmlToText, normalizeEmployment, type Salary } from "./text"

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])
const str = (v: unknown): string => (typeof v === "string" ? collapse(v) : typeof v === "number" ? String(v) : "")

const MAX_BLOCKS = 30
const MAX_BLOCK_CHARS = 1_000_000

function isJobPosting(o: Obj): boolean {
  return arr(o["@type"]).some((t) => typeof t === "string" && /(^|[/#])JobPosting$/i.test(t))
}

/** Walks arrays, @graph and nested objects collecting JobPosting nodes. Cycles can't occur: JSON has none. */
function collect(node: unknown, out: Obj[], depth = 0): void {
  if (depth > 8 || out.length > 50) return
  if (Array.isArray(node)) return node.forEach((n) => collect(n, out, depth + 1))
  if (!isObj(node)) return
  if (isJobPosting(node)) out.push(node)
  collect(node["@graph"], out, depth + 1)
  collect(node.mainEntity, out, depth + 1)
  collect(node.itemListElement, out, depth + 1)
  collect(node.item, out, depth + 1)
}

/** All JobPosting objects in the page's JSON-LD blocks. A block that isn't valid JSON is skipped, not fatal. */
export function readPostings(doc: Document): Obj[] {
  const out: Obj[] = []
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json" i]')].slice(0, MAX_BLOCKS)
  for (const b of blocks) {
    const text = b.textContent ?? ""
    if (!text || text.length > MAX_BLOCK_CHARS) continue
    try {
      collect(JSON.parse(text), out)
    } catch {
      /* malformed block */
    }
  }
  return out
}

function ids(p: Obj): string[] {
  return arr(p.identifier).flatMap((i) => (isObj(i) ? [str(i.value)] : [str(i)])).filter((s) => s.length >= 3)
}

const sameJob = (a: string, b: URL): boolean => {
  const u = parseUrl(a)
  return !!u && jobKey(u) === jobKey(b)
}

export interface Chosen {
  posting?: Obj
  /** Several postings and none could be tied to this page. */
  ambiguous: boolean
  count: number
}

/**
 * Picks the posting this page is about. One posting is taken as is. Several are narrowed by the page URL, then by
 * an identifier that appears in the URL, then by the page's own heading. If that doesn't leave exactly one, none is
 * used: unrelated postings are never combined.
 */
export function choose(postings: Obj[], page: URL, heading: string): Chosen {
  const count = postings.length
  if (count === 0) return { ambiguous: false, count }
  if (count === 1) return { posting: postings[0], ambiguous: false, count }
  const steps: ((p: Obj) => boolean)[] = [
    (p) => [str(p.url), str(p["@id"]), isObj(p.mainEntityOfPage) ? str(p.mainEntityOfPage["@id"]) : str(p.mainEntityOfPage)].some((u) => u && sameJob(u, page)),
    (p) => ids(p).some((id) => page.href.includes(id)),
    (p) => !!heading && collapse(str(p.title) || str(p.name)).toLowerCase() === heading.toLowerCase(),
  ]
  for (const step of steps) {
    const hit = postings.filter(step)
    if (hit.length === 1) return { posting: hit[0], ambiguous: false, count }
    if (hit.length > 1) return { ambiguous: true, count }
  }
  return { ambiguous: true, count }
}

function place(loc: unknown): string {
  if (typeof loc === "string") return collapse(loc)
  if (!isObj(loc)) return ""
  const a = loc.address ?? loc
  if (typeof a === "string") return collapse(a)
  if (!isObj(a)) return ""
  const country = isObj(a.addressCountry) ? str(a.addressCountry.name) : str(a.addressCountry)
  return [str(a.addressLocality), str(a.addressRegion), country].filter(Boolean).join(", ")
}

export interface PostingFields {
  title?: string
  company?: string
  location?: string
  arrangement?: string
  employmentType?: string
  salary?: string
  salaryParsed?: Salary
  description?: string
  externalId?: string
}

const PERIOD: Record<string, Salary["period"]> = { YEAR: "year", MONTH: "month", WEEK: "week", DAY: "day", HOUR: "hour" }

/** Only what the posting says. Absent or unreadable parts stay undefined. */
export function postingFields(p: Obj): PostingFields {
  const f: PostingFields = {}
  const title = str(p.title) || str(p.name)
  if (title) f.title = title
  const org = isObj(p.hiringOrganization) ? str(p.hiringOrganization.name) : str(p.hiringOrganization)
  if (org) f.company = org
  const locs = arr(p.jobLocation).map(place).filter(Boolean)
  if (locs.length) f.location = [...new Set(locs)].join("; ")
  if (str(p.jobLocationType).toUpperCase() === "TELECOMMUTE") f.arrangement = "remote"
  const emp = arr(p.employmentType).map((e) => normalizeEmployment(str(e))).filter(Boolean)
  if (emp.length) f.employmentType = [...new Set(emp)].join(", ")
  const base = p.baseSalary
  if (isObj(base)) {
    const v = isObj(base.value) ? base.value : base
    const min = Number(v.minValue ?? v.value), max = Number(v.maxValue ?? v.value)
    const currency = str(base.currency).toUpperCase().slice(0, 3)
    const unit = str(v.unitText).toUpperCase()
    if (Number.isFinite(min) && min > 0) {
      const hi = Number.isFinite(max) && max > 0 ? max : min
      const period = PERIOD[unit] ?? ""
      f.salaryParsed = { min: Math.min(min, hi), max: Math.max(min, hi), currency: /^[A-Z]{3}$/.test(currency) ? currency : "", period }
      f.salary = `${currency ? currency + " " : ""}${min === hi ? min : `${min}–${hi}`}${period ? ` per ${period}` : ""}`
    }
  }
  if (typeof p.description === "string") {
    const d = htmlToText(p.description)
    if (d) f.description = d
  }
  const id = ids(p)[0]
  if (id) f.externalId = id
  return f
}
