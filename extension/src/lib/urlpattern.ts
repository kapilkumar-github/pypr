import type { HostRule, PagePattern, QueryRule, SiteConfig } from "./schema"

/** Parses an http(s) URL. Anything else (chrome://, file:, javascript:, garbage) is null. */
export function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    return u.protocol === "https:" || u.protocol === "http:" ? u : null
  } catch {
    return null
  }
}

const PARAM = /^:([A-Za-z][A-Za-z0-9_]{0,30})$/

export function segments(path: string): string[] {
  return path.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })
}

/** A path pattern is "/", or "/" followed by fixed segments and `:name` parameters. No wildcards, no regular expressions. */
export function validPath(path: string): string | null {
  if (!path.startsWith("/")) return "Start the path with /."
  if (/[?#\s*()[\]{}|\\^$+]/.test(path)) return "Use only fixed text and :name parameters."
  const names = new Set<string>()
  for (const raw of path.split("/").filter(Boolean)) {
    if (raw.startsWith(":")) {
      const m = PARAM.exec(raw)
      if (!m) return `"${raw}" isn't a valid parameter name.`
      if (names.has(m[1]!)) return `Parameter ${raw} is used twice.`
      names.add(m[1]!)
    }
  }
  return null
}

export function hostMatches(rule: HostRule, host: string): boolean {
  const h = host.toLowerCase()
  const r = rule.host.toLowerCase()
  return h === r || (rule.subdomains && h.endsWith("." + r))
}

export type Params = Record<string, string>

/** Matches the path and required query parameters, returning the values of the varying parts. */
export function matchPattern(p: Pick<PagePattern, "path" | "query">, url: URL): Params | null {
  const want = p.path.split("/").filter(Boolean)
  const have = url.pathname.split("/").filter(Boolean)
  if (want.length !== have.length) return null
  const params: Params = {}
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!
    const h = segments("/" + have[i]!)[0] ?? ""
    const m = PARAM.exec(w)
    if (m) {
      if (!h) return null
      params[m[1]!] = h
    } else if (w !== h) return null
  }
  for (const q of p.query) {
    const v = url.searchParams.get(q.name)
    if (!v) return null
    if (q.value !== undefined && q.value !== v) return null
    params[q.name] = v
  }
  return params
}

/** Higher is more specific: an exact host beats a subdomain rule, then more fixed path parts, then fixed or required query parameters. */
export function specificity(rule: HostRule, p: Pick<PagePattern, "path" | "query">): number {
  const fixed = p.path.split("/").filter((s) => s && !s.startsWith(":")).length
  return (rule.subdomains ? 0 : 1000) + fixed * 100 + p.query.filter((q) => q.value !== undefined).length * 10 + p.query.length * 5
}

export interface Match {
  config: SiteConfig
  pattern: PagePattern
  params: Params
  score: number
}

export type Resolution = { kind: "none" } | { kind: "match"; match: Match } | { kind: "conflict"; matches: Match[] }

export function matchesFor(configs: SiteConfig[], url: URL): Match[] {
  const out: Match[] = []
  for (const config of configs) {
    if (!config.enabled) continue
    for (const rule of config.hosts) {
      if (!hostMatches(rule, url.hostname)) continue
      for (const pattern of config.patterns) {
        const params = matchPattern(pattern, url)
        if (params) out.push({ config, pattern, params, score: specificity(rule, pattern) })
      }
    }
  }
  return out
}

/**
 * Picks the one configuration for a page. The most specific match wins; at equal specificity the user's own
 * configuration beats a bundled one. Anything still tied is a conflict the user must settle.
 */
export function resolve(configs: SiteConfig[], url: URL): Resolution {
  const all = matchesFor(configs, url)
  if (all.length === 0) return { kind: "none" }
  const rank = (m: Match) => m.score * 2 + (m.config.bundled ? 0 : 1)
  const top = Math.max(...all.map(rank))
  const best = all.filter((m) => rank(m) === top)
  // The same pattern reached through two host rules of one config is one match.
  const unique = best.filter((m, i) => best.findIndex((o) => o.config.id === m.config.id && o.pattern.id === m.pattern.id) === i)
  return unique.length === 1 ? { kind: "match", match: unique[0]! } : { kind: "conflict", matches: unique }
}

// Query keys that usually name the job on pages that don't put it in the path.
const ID_KEYS = ["id", "jobid", "job_id", "jid", "gh_jid", "jk", "currentjobid", "reqid", "requisitionid", "job", "posting", "positionid", "vacancyid"]

const looksLikeId = (s: string) => /\d/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)

export interface Proposal {
  host: string
  path: string
  query: QueryRule[]
}

/**
 * Suggests a pattern for a job URL. Only the last path segment is offered as a variable (when it looks like an ID),
 * so "/careers/2024/openings/SR304478" keeps "careers", "2024" and "openings" fixed. The user reviews and edits.
 */
export function propose(url: URL): Proposal {
  const segs = url.pathname.split("/").filter(Boolean)
  const last = segs.length - 1
  const path = "/" + segs.map((s, i) => (i === last && looksLikeId(s) ? ":jobId" : s)).join("/")
  const query: QueryRule[] = []
  for (const [k, v] of url.searchParams) if (ID_KEYS.includes(k.toLowerCase()) && v && !query.some((q) => q.name === k)) query.push({ name: k })
  return { host: url.hostname.toLowerCase(), path: segs.length ? path : "/", query: query.slice(0, 5) }
}

export interface Part {
  text: string
  fixed: boolean
}

/** The URL split for display: which parts must match and which vary. */
export function parts(p: { path: string; query: QueryRule[] }): Part[] {
  const out: Part[] = p.path.split("/").filter(Boolean).map((s) => ({ text: "/" + s, fixed: !s.startsWith(":") }))
  if (out.length === 0) out.push({ text: "/", fixed: true })
  for (const q of p.query) out.push({ text: `?${q.name}=${q.value ?? "*"}`, fixed: q.value !== undefined })
  return out
}

/** Swaps one path segment between fixed (the current URL's text) and a variable. */
export function toggleSegment(path: string, index: number, current: URL): string {
  const segs = path.split("/").filter(Boolean)
  const actual = current.pathname.split("/").filter(Boolean)
  const seg = segs[index]
  if (seg === undefined) return path
  if (seg.startsWith(":")) segs[index] = actual[index] ?? seg
  else {
    const used = new Set(segs.filter((s) => s.startsWith(":")).map((s) => s.slice(1)))
    let name = "jobId"
    for (let n = 2; used.has(name); n++) name = `part${n}`
    segs[index] = ":" + name
  }
  return "/" + segs.join("/")
}

/**
 * Identity of a job page for drafts and duplicate checks: host without "www.", path without a trailing slash and the
 * query parameters the pattern requires. Everything else (tracking, referrers, fragments) is dropped.
 */
export function jobKey(url: URL, pattern?: Pick<PagePattern, "query">): string {
  const keep = new Set((pattern?.query ?? []).map((q) => q.name))
  const q = [...url.searchParams].filter(([k]) => keep.has(k)).sort(([a], [b]) => a.localeCompare(b))
  const search = q.length ? "?" + q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : ""
  const path = url.pathname.replace(/\/+$/, "") || "/"
  return `${url.hostname.toLowerCase().replace(/^www\./, "")}${path}${search}`
}

/** The URL to store as the job's page: the pattern's parts only, so a reopened link still finds the job. */
export function canonicalUrl(url: URL, pattern?: Pick<PagePattern, "query">): string {
  const keep = new Set((pattern?.query ?? []).map((q) => q.name))
  const u = new URL(url.origin + url.pathname)
  for (const [k, v] of url.searchParams) if (keep.has(k)) u.searchParams.append(k, v)
  return u.toString()
}

/** Match origin pattern for chrome.permissions / content script registration. */
export function originPatterns(rule: HostRule): string[] {
  const hosts = rule.subdomains ? [rule.host, "*." + rule.host] : [rule.host]
  return hosts.flatMap((h) => [`https://${h}/*`, `http://${h}/*`]).filter((p) => !p.startsWith("http://") || /^http:\/\/(\*\.)?(localhost|127\.0\.0\.1)(:|\/)/.test(p) || false)
}
