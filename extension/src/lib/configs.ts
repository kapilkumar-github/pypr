import { FieldSchema, SiteConfigSchema, type Field, type FieldMapping, type PagePattern, type SiteConfig } from "./schema"
import { propose, validPath } from "./urlpattern"

export function newId(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(6))
  return `${prefix}-${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`
}

/** A new, empty configuration for the page the user is on, with a proposed URL pattern to review. */
export function createConfig(url: URL, now = new Date()): { config: SiteConfig; pattern: PagePattern } {
  const p = propose(url)
  const pattern: PagePattern = { id: newId("pat"), path: p.path, query: p.query, fields: {} }
  const config: SiteConfig = {
    id: newId("site"),
    name: url.hostname.replace(/^www\./, ""),
    hosts: [{ host: p.host, subdomains: false }],
    patterns: [pattern],
    enabled: true,
    version: 0,
    updatedAt: now.toISOString(),
  }
  return { config, pattern }
}

const mapPattern = (c: SiteConfig, patternId: string, fn: (p: PagePattern) => PagePattern): SiteConfig => ({
  ...c,
  patterns: c.patterns.map((p) => (p.id === patternId ? fn(p) : p)),
})

/**
 * Sets a field's mapping. This is an upsert by site, page pattern and field: the old selector and its fallbacks are
 * replaced as a whole and every other field is untouched.
 */
export function upsertMapping(c: SiteConfig, patternId: string, field: Field, mapping: FieldMapping): SiteConfig {
  return mapPattern(c, patternId, (p) => ({ ...p, fields: { ...p.fields, [field]: mapping } }))
}

/** Removes one field's mapping. The site and its other mappings stay. */
export function clearMapping(c: SiteConfig, patternId: string, field: Field): SiteConfig {
  return mapPattern(c, patternId, (p) => {
    const fields = { ...p.fields }
    delete fields[field]
    return { ...p, fields }
  })
}

export function setPatternShape(c: SiteConfig, patternId: string, shape: { path: string; query: PagePattern["query"] }): SiteConfig {
  return mapPattern(c, patternId, (p) => ({ ...p, path: shape.path, query: shape.query }))
}

export function addPattern(c: SiteConfig, shape: { path: string; query: PagePattern["query"] }): { config: SiteConfig; pattern: PagePattern } {
  const pattern: PagePattern = { id: newId("pat"), path: shape.path, query: shape.query, fields: {} }
  return { config: { ...c, patterns: [...c.patterns, pattern] }, pattern }
}

export function removePattern(c: SiteConfig, patternId: string): SiteConfig {
  return { ...c, patterns: c.patterns.filter((p) => p.id !== patternId) }
}

/** Checks a configuration from storage, a message or the editor. Returns the parsed config or a message for the user. */
export function validateConfig(input: unknown): { ok: true; config: SiteConfig } | { ok: false; error: string } {
  const r = SiteConfigSchema.safeParse(input)
  if (!r.success) return { ok: false, error: r.error.issues[0] ? `${r.error.issues[0].path.join(".")}: ${r.error.issues[0].message}` : "Invalid configuration." }
  const c = r.data
  if (c.bundled) return { ok: false, error: "Bundled sites can't be changed." }
  const seen = new Set<string>()
  for (const p of c.patterns) {
    const why = validPath(p.path)
    if (why) return { ok: false, error: `Path "${p.path}": ${why}` }
    if (seen.has(p.id)) return { ok: false, error: "Duplicate pattern." }
    seen.add(p.id)
    for (const f of Object.keys(p.fields)) if (!FieldSchema.safeParse(f).success) return { ok: false, error: `Unknown field ${f}.` }
  }
  for (const h of c.hosts) if (!/^[a-z0-9.-]+$/i.test(h.host) || h.host.startsWith(".") || h.host.includes("..")) return { ok: false, error: `"${h.host}" isn't a valid host name.` }
  return { ok: true, config: c }
}

export const sameConfig = (a: SiteConfig | undefined, b: SiteConfig | undefined): boolean => JSON.stringify(a) === JSON.stringify(b)
