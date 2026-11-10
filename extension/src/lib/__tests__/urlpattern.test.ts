import { describe, expect, it } from "vitest"
import type { SiteConfig } from "../schema"
import { canonicalUrl, hostMatches, jobKey, matchPattern, originPatterns, parts, propose, resolve, specificity, toggleSegment, validPath } from "../urlpattern"

const u = (s: string) => new URL(s)
const site = (id: string, host: string, path: string, extra: Partial<SiteConfig> = {}, query: { name: string; value?: string }[] = [], subdomains = false): SiteConfig => ({
  id, name: id, hosts: [{ host, subdomains }], patterns: [{ id: id + "-p", path, query, fields: {} }], enabled: true, version: 1, updatedAt: "", ...extra,
})

describe("pattern matching", () => {
  it("matches another job on the same layout", () => {
    const p = { path: "/job/view/:jobId", query: [] }
    expect(matchPattern(p, u("https://jobs.surelyremote.com/job/view/SR304478"))).toEqual({ jobId: "SR304478" })
    expect(matchPattern(p, u("https://jobs.surelyremote.com/job/view/SR304479/"))).toEqual({ jobId: "SR304479" })
  })
  it("rejects other pages of the same domain", () => {
    const p = { path: "/job/view/:jobId", query: [] }
    for (const x of ["/", "/jobs", "/job/view", "/job/view/1/apply", "/job/edit/1", "/company/view/1"]) expect(matchPattern(p, u("https://jobs.surelyremote.com" + x))).toBeNull()
  })
  it("requires query parameters for query-based pages", () => {
    const p = { path: "/careers", query: [{ name: "gh_jid" }, { name: "src", value: "x" }] }
    expect(matchPattern(p, u("https://a.com/careers"))).toBeNull()
    expect(matchPattern(p, u("https://a.com/careers?gh_jid=12"))).toBeNull()
    expect(matchPattern(p, u("https://a.com/careers?gh_jid=12&src=y"))).toBeNull()
    expect(matchPattern(p, u("https://a.com/careers?gh_jid=12&src=x&utm=1"))).toEqual({ gh_jid: "12", src: "x" })
    expect(matchPattern(p, u("https://a.com/careers?gh_jid=&src=x"))).toBeNull()
  })
  it("never treats a different fixed segment as a parameter", () => {
    expect(matchPattern({ path: "/jobs/:id", query: [] }, u("https://a.com/roles/9"))).toBeNull()
  })
  it("matches hosts exactly unless subdomains are approved", () => {
    expect(hostMatches({ host: "a.com", subdomains: false }, "a.com")).toBe(true)
    expect(hostMatches({ host: "a.com", subdomains: false }, "x.a.com")).toBe(false)
    expect(hostMatches({ host: "a.com", subdomains: true }, "x.a.com")).toBe(true)
    expect(hostMatches({ host: "a.com", subdomains: true }, "nota.com")).toBe(false)
    expect(hostMatches({ host: "a.com", subdomains: true }, "a.com.evil.com")).toBe(false)
  })
})

describe("path validation", () => {
  it("accepts fixed segments and :params only", () => {
    expect(validPath("/job/view/:jobId")).toBeNull()
    expect(validPath("/")).toBeNull()
    for (const bad of ["job/view", "/jobs/.*", "/a/(b)", "/a/:1x", "/a/:id/:id", "/a?x=1", "/a/*"]) expect(validPath(bad), bad).not.toBeNull()
  })
})

describe("specificity and conflicts", () => {
  it("prefers the more specific configuration", () => {
    const generic = site("generic", "a.com", "/jobs/:id")
    const specific = site("specific", "a.com", "/jobs/remote/:id")
    const url = u("https://a.com/jobs/remote/7")
    expect(matchPattern(generic.patterns[0]!, u("https://a.com/jobs/remote/7"))).toBeNull() // different shape
    const both = [site("g", "a.com", "/jobs/:kind/:id"), site("s", "a.com", "/jobs/remote/:id")]
    const r = resolve(both, url)
    expect(r.kind === "match" && r.match.config.id).toBe("s")
    void specific
  })
  it("prefers an exact host over a subdomain rule", () => {
    expect(specificity({ host: "a.com", subdomains: false }, { path: "/j/:id", query: [] })).toBeGreaterThan(specificity({ host: "a.com", subdomains: true }, { path: "/j/:id", query: [] }))
    const r = resolve([site("wild", "a.com", "/j/:id", {}, [], true), site("exact", "x.a.com", "/j/:id")], u("https://x.a.com/j/1"))
    expect(r.kind === "match" && r.match.config.id).toBe("exact")
  })
  it("prefers the user's configuration over a bundled one", () => {
    const r = resolve([site("b", "a.com", "/j/:id", { bundled: true }), site("mine", "a.com", "/j/:id")], u("https://a.com/j/1"))
    expect(r.kind === "match" && r.match.config.id).toBe("mine")
  })
  it("reports equally specific user configurations as a conflict", () => {
    const r = resolve([site("one", "a.com", "/j/:id"), site("two", "a.com", "/j/:key")], u("https://a.com/j/1"))
    expect(r.kind).toBe("conflict")
  })
  it("skips disabled configurations and unrelated domains", () => {
    expect(resolve([site("off", "a.com", "/j/:id", { enabled: false })], u("https://a.com/j/1")).kind).toBe("none")
    expect(resolve([site("a", "a.com", "/j/:id")], u("https://b.com/j/1")).kind).toBe("none")
  })
  it("keeps configurations for different domains apart", () => {
    const cfgs = [site("a", "a.com", "/job/:id"), site("b", "b.com", "/job/:id")]
    const r = resolve(cfgs, u("https://b.com/job/3"))
    expect(r.kind === "match" && r.match.config.id).toBe("b")
  })
})

describe("proposals", () => {
  it("proposes a pattern from the Surely Remote example", () => {
    const p = propose(u("https://jobs.surelyremote.com/job/view/SR304478"))
    expect(p).toEqual({ host: "jobs.surelyremote.com", path: "/job/view/:jobId", query: [] })
    expect(matchPattern(p, u("https://jobs.surelyremote.com/job/view/SR304479"))).toEqual({ jobId: "SR304479" })
  })
  it("keeps non-final numeric segments fixed", () => {
    expect(propose(u("https://a.com/careers/2024/openings/1234")).path).toBe("/careers/2024/openings/:jobId")
    expect(propose(u("https://a.com/en/jobs/senior-engineer")).path).toBe("/en/jobs/senior-engineer")
  })
  it("offers only ID-looking query parameters", () => {
    const p = propose(u("https://a.com/careers?gh_jid=4412&utm_source=x&page=2"))
    expect(p.query).toEqual([{ name: "gh_jid" }])
  })
  it("shows fixed and varying parts and toggles a segment", () => {
    expect(parts({ path: "/job/view/:jobId", query: [{ name: "x" }] }).map((x) => [x.text, x.fixed])).toEqual([["/job", true], ["/view", true], ["/:jobId", false], ["?x=*", false]])
    const url = u("https://a.com/job/view/SR1")
    expect(toggleSegment("/job/view/:jobId", 2, url)).toBe("/job/view/SR1")
    expect(toggleSegment("/job/view/SR1", 0, url)).toBe("/:jobId/view/SR1")
  })
})

describe("job identity", () => {
  it("keeps only the query parameters the pattern needs", () => {
    const pat = { query: [{ name: "gh_jid" }] }
    expect(jobKey(u("https://www.a.com/careers/?gh_jid=5&utm_source=x#top"), pat)).toBe("a.com/careers?gh_jid=5")
    expect(jobKey(u("https://a.com/careers?gh_jid=6"), pat)).not.toBe(jobKey(u("https://a.com/careers?gh_jid=5"), pat))
    expect(canonicalUrl(u("https://a.com/careers?gh_jid=5&utm_source=x#top"), pat)).toBe("https://a.com/careers?gh_jid=5")
  })
  it("builds permission patterns, https only except localhost", () => {
    expect(originPatterns({ host: "a.com", subdomains: false })).toEqual(["https://a.com/*"])
    expect(originPatterns({ host: "a.com", subdomains: true })).toEqual(["https://a.com/*", "https://*.a.com/*"])
    expect(originPatterns({ host: "localhost", subdomains: false })).toContain("http://localhost/*")
  })
})
