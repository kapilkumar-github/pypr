import { describe, expect, it } from "vitest"
import { clearMapping, createConfig, upsertMapping, validateConfig, sameConfig } from "../configs"
import type { FieldMapping } from "../schema"

const m = (selector: string, extra: Partial<FieldMapping> = {}): FieldMapping => ({ selector, fallbacks: [], mode: "text", ...extra })

describe("mapping upsert", () => {
  const { config, pattern } = createConfig(new URL("https://jobs.surelyremote.com/job/view/SR304478"))

  it("starts from a proposed pattern", () => {
    expect(config.hosts).toEqual([{ host: "jobs.surelyremote.com", subdomains: false }])
    expect(pattern.path).toBe("/job/view/:jobId")
  })

  it("replaces the previous mapping for the same field, selector and fallbacks together", () => {
    const a = upsertMapping(config, pattern.id, "title", m("h1.old", { fallbacks: ["#old"] }))
    const b = upsertMapping(a, pattern.id, "title", m("h2.new", { fallbacks: [] }))
    expect(b.patterns[0]!.fields.title).toEqual(m("h2.new"))
    expect(Object.keys(b.patterns[0]!.fields)).toEqual(["title"])
  })

  it("leaves other fields and other patterns alone", () => {
    const { config: two } = { config: { ...config, patterns: [...config.patterns, { id: "p2", path: "/x", query: [], fields: { title: m("h3") } }] } }
    const a = upsertMapping(two, pattern.id, "company", m(".co"))
    const b = upsertMapping(a, pattern.id, "title", m(".t"))
    expect(b.patterns[0]!.fields.company).toEqual(m(".co"))
    expect(b.patterns[1]!.fields.title).toEqual(m("h3"))
  })

  it("does not mutate its input", () => {
    const before = JSON.stringify(config)
    upsertMapping(config, pattern.id, "title", m("x"))
    expect(JSON.stringify(config)).toBe(before)
  })

  it("clears one field without deleting the site", () => {
    const a = upsertMapping(upsertMapping(config, pattern.id, "title", m("a")), pattern.id, "company", m("b"))
    const b = clearMapping(a, pattern.id, "title")
    expect(b.patterns[0]!.fields).toEqual({ company: m("b") })
    expect(b.id).toBe(config.id)
  })

  it("detects unsaved changes", () => {
    expect(sameConfig(config, config)).toBe(true)
    expect(sameConfig(config, upsertMapping(config, pattern.id, "title", m("a")))).toBe(false)
  })
})

describe("config validation", () => {
  const { config } = createConfig(new URL("https://a.com/jobs/12"))
  it("accepts a good configuration", () => expect(validateConfig(config).ok).toBe(true))
  it("rejects regex-like paths, bad hosts, bundled and unknown fields", () => {
    expect(validateConfig({ ...config, patterns: [{ ...config.patterns[0]!, path: "/jobs/(\\d+)" }] }).ok).toBe(false)
    expect(validateConfig({ ...config, hosts: [{ host: "a.com/../x", subdomains: false }] }).ok).toBe(false)
    expect(validateConfig({ ...config, bundled: true }).ok).toBe(false)
    expect(validateConfig({ ...config, patterns: [{ ...config.patterns[0]!, fields: { nope: m("x") } }] }).ok).toBe(false)
    expect(validateConfig({ ...config, name: "" }).ok).toBe(false)
  })
})
