import { detectAts } from "./adapters"
import { choose, postingFields, readPostings, type PostingFields } from "./jsonld"
import { type Field, type FieldMapping, type JobForm, type PagePattern, emptyForm, SOURCES } from "./schema"
import { find, inOwnUi } from "./selector"
import { collapse, normalizeEmployment, parseArrangement, parseSalary, structuredText, type Salary } from "./text"
import { canonicalUrl, parseUrl } from "./urlpattern"

export type Origin = "mapping" | "structured" | "adapter" | "generic"

export interface FieldResult {
  value: string
  origin: Origin
  selector?: string
  usedFallback?: boolean
}

export interface FieldFailure {
  reason: "missing" | "ambiguous" | "mismatch" | "empty" | "invalid"
  detail: string
}

export interface Extraction {
  values: Partial<Record<Field, FieldResult>>
  failures: Partial<Record<Field, FieldFailure>>
  salary?: Salary
  externalId?: string
  ats?: string
  notes: string[]
}

const LIMIT: Record<Field, number> = { title: 300, company: 200, location: 300, arrangement: 100, employmentType: 100, salary: 300, description: 100_000, applicationUrl: 2000 }

/** Reads an element the way a mapping says to. Used for saved mappings and for previewing a pending choice. */
export function readElement(field: Field, el: Element, m: Pick<FieldMapping, "mode" | "attr">, doc: Document): { ok: true; value: string } | { ok: false; failure: FieldFailure } {
  // Pypr never reads what someone typed into a page (application forms, search boxes, passwords).
  if (el.matches("input, textarea, select, form, [contenteditable]:not([contenteditable=false])")) {
    return { ok: false, failure: { reason: "invalid", detail: "Pypr doesn't read form fields." } }
  }
  let value = ""
  if (m.mode === "attr") {
    const name = (m.attr ?? "").toLowerCase()
    if (!name) return { ok: false, failure: { reason: "invalid", detail: "The mapping has no attribute to read." } }
    const raw = el.getAttribute(name) ?? ""
    value = collapse(name === "href" || name === "src" ? resolveUrl(raw, doc) : raw)
    if (name === "href" && raw && !value) return { ok: false, failure: { reason: "invalid", detail: "The link doesn't use http or https." } }
    if (name === "href" && !raw) return { ok: false, failure: { reason: "invalid", detail: "That element isn't a link." } }
  } else if (m.mode === "html") value = structuredText(el, LIMIT[field])
  else value = collapse(el.textContent ?? "")
  if (field === "applicationUrl" && value && !parseUrl(value)) return { ok: false, failure: { reason: "invalid", detail: "The link doesn't use http or https." } }
  if (!value) return { ok: false, failure: { reason: "empty", detail: "The element is on the page but has no text." } }
  return { ok: true, value: value.slice(0, LIMIT[field]) }
}

/** Reads one mapped field. A saved selector that fails is reported, never replaced by guesswork. */
export function readMapping(field: Field, m: FieldMapping, doc: Document): { ok: true; value: string; selector: string; usedFallback: boolean } | { ok: false; failure: FieldFailure } {
  const r = find(m, doc)
  if (!r.ok) return { ok: false, failure: { reason: r.reason, detail: r.detail } }
  const v = readElement(field, r.el, m, doc)
  return v.ok ? { ok: true, value: v.value, selector: r.selector, usedFallback: r.usedFallback } : v
}

/** Resolves a link against the page. Only http(s) survives; javascript:, data: and the like are dropped. */
function resolveUrl(raw: string, doc: Document): string {
  try {
    const u = new URL(raw, doc.baseURI)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : ""
  } catch {
    return ""
  }
}

const visibleH1 = (doc: Document): string => {
  const h = [...doc.querySelectorAll("h1")].filter((e) => !inOwnUi(e) && collapse(e.textContent ?? ""))
  return h.length === 1 ? collapse(h[0]!.textContent ?? "") : ""
}

const meta = (doc: Document, key: string) => collapse(doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content") ?? "")

/** Last-resort page signals. Only things a page states explicitly; nothing is inferred from body text. */
function generic(doc: Document, field: Field): string {
  switch (field) {
    case "title": return visibleH1(doc)
    case "company": return meta(doc, "og:site_name")
    case "location": {
      const els = [...doc.querySelectorAll('[itemprop="jobLocation"], [itemprop="addressLocality"]')].filter((e) => !inOwnUi(e))
      return els.length === 1 ? collapse(els[0]!.textContent ?? "") : ""
    }
    case "description": {
      const els = [...doc.querySelectorAll('[itemprop="description"]')].filter((e) => !inOwnUi(e))
      return els.length === 1 ? structuredText(els[0]!, LIMIT.description) : ""
    }
    case "applicationUrl": {
      const links = [...doc.querySelectorAll("a[href]")].filter((a) => !inOwnUi(a) && /^apply( now| for this (job|role|position))?$/i.test(collapse(a.textContent ?? "")))
      const hrefs = [...new Set(links.map((a) => resolveUrl(a.getAttribute("href") ?? "", doc)).filter(Boolean))]
      return hrefs.length === 1 ? hrefs[0]! : ""
    }
    default: return ""
  }
}

export interface ExtractOptions {
  pattern?: PagePattern
  /** ATS the matched site configuration declares. */
  ats?: string
  /** Values captured by the URL pattern (for example { jobId }). */
  params?: Record<string, string>
}

const FIELD_ORDER: Field[] = ["title", "company", "location", "arrangement", "employmentType", "salary", "description", "applicationUrl"]

/**
 * Reads a job from the page. For each field, in order: the user's saved mapping, schema.org JobPosting data, the
 * bundled adapter (IDs from the URL), then explicit generic signals. A mapping that fails is reported and not
 * replaced by generic guesses; structured data may still fill it, because it describes the same posting.
 */
export function extract(doc: Document, url: URL, opts: ExtractOptions = {}): Extraction {
  const out: Extraction = { values: {}, failures: {}, notes: [] }
  const postings = readPostings(doc)
  const chosen = choose(postings, url, visibleH1(doc))
  if (chosen.ambiguous) out.notes.push(`This page lists ${chosen.count} job postings and none could be matched to this page, so structured data was not used.`)
  const sd: PostingFields = chosen.posting ? postingFields(chosen.posting) : {}

  const structuredFor = (f: Field): string | undefined => {
    const v = f === "arrangement" ? sd.arrangement : sd[f as keyof PostingFields]
    return typeof v === "string" && v ? v : undefined
  }

  for (const field of FIELD_ORDER) {
    const mapping = opts.pattern?.fields[field]
    if (mapping) {
      const r = readMapping(field, mapping, doc)
      if (r.ok) {
        out.values[field] = { value: r.value, origin: "mapping", selector: r.selector, usedFallback: r.usedFallback }
        continue
      }
      out.failures[field] = r.failure
    }
    const s = structuredFor(field)
    if (s) {
      out.values[field] = { value: s.slice(0, LIMIT[field]), origin: "structured" }
      continue
    }
    if (mapping) continue
    const g = generic(doc, field)
    if (g) out.values[field] = { value: g.slice(0, LIMIT[field]), origin: "generic" }
  }

  const ats = detectAts(url)
  out.ats = opts.ats ?? ats?.ats
  out.externalId = sd.externalId ?? opts.params?.jobId ?? ats?.externalId
  out.salary = out.values.salary?.origin === "structured" ? sd.salaryParsed : out.values.salary ? parseSalary(out.values.salary.value) ?? undefined : undefined
  return out
}

/** Turns an extraction into the editable form. Missing values stay empty. */
export function toForm(x: Extraction, url: URL, pattern?: Pick<PagePattern, "query">): JobForm {
  const f = emptyForm(canonicalUrl(url, pattern))
  const v = (k: Field) => x.values[k]?.value ?? ""
  f.title = v("title")
  f.company = v("company")
  f.location = v("location")
  f.employmentType = v("employmentType") ? normalizeEmployment(v("employmentType")) : ""
  f.description = v("description")
  f.applicationUrl = v("applicationUrl")
  f.salaryText = v("salary")
  f.workArrangement = parseArrangement(v("arrangement"))
  if (x.salary) {
    f.salaryMin = x.salary.min !== undefined ? String(x.salary.min) : ""
    f.salaryMax = x.salary.max !== undefined ? String(x.salary.max) : ""
    f.salaryCurrency = x.salary.currency
    f.salaryPeriod = x.salary.period
  }
  f.source = x.ats && (SOURCES as readonly string[]).includes(x.ats) ? x.ats : ""
  f.externalId = (x.externalId ?? "").slice(0, 200)
  return f
}

/**
 * Why a page might look empty to Pypr. Content inside frames and shadow roots isn't part of the page Pypr reads, so
 * when little was found these are named instead of pretending the page has no job.
 */
export function limitations(doc: Document): string[] {
  const out: string[] = []
  const frames = [...doc.querySelectorAll("iframe")].filter((f) => !inOwnUi(f) && (f.src || f.srcdoc))
  if (frames.length) out.push("This page shows some content in a frame. Pypr reads the main page only, so anything inside a frame is out of reach.")
  // Elements named like web components that are empty in the light DOM keep their content in a shadow root.
  const hosts = [...doc.querySelectorAll("*")].filter((e) => e.localName.includes("-") && !inOwnUi(e) && (e.shadowRoot || (e.childNodes.length === 0 && !e.textContent)))
  if (hosts.length) out.push("Parts of this page are built with web components (shadow DOM). Pypr can't read inside them.")
  return out
}

/** Names of the fields the form still lacks, for the "missing" list. Title and company are required to save. */
export function missing(f: JobForm): { required: string[]; optional: string[] } {
  const required = [!f.title.trim() && "Job title", !f.company.trim() && "Company"].filter(Boolean) as string[]
  const optional = [!f.location.trim() && "Location", f.workArrangement === "unknown" && "Work arrangement", !f.employmentType.trim() && "Employment type", !f.salaryText.trim() && "Salary", !f.description.trim() && "Description", !f.applicationUrl.trim() && "Application link"].filter(Boolean) as string[]
  return { required, optional }
}
