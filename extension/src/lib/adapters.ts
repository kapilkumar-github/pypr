import type { HostRule, SiteConfig } from "./schema"
import { parseUrl } from "./urlpattern"

/** What a bundled adapter knows from the URL alone. Nothing here reads the page. */
export interface AtsInfo {
  ats: string
  externalId?: string
}

interface Adapter {
  ats: string
  hosts: string[]
  /** Reads the job ID from path segments. */
  id: (segs: string[], url: URL) => string | undefined
}

const last = (segs: string[]) => segs[segs.length - 1]

// Exact hosts only: a similar-looking path on another domain is not evidence of the same ATS.
const ADAPTERS: Adapter[] = [
  { ats: "greenhouse", hosts: ["boards.greenhouse.io", "job-boards.greenhouse.io"], id: (s, u) => (s[1] === "jobs" ? s[2] : u.searchParams.get("gh_jid") ?? undefined) },
  { ats: "lever", hosts: ["jobs.lever.co"], id: (s) => s[1] },
  { ats: "ashby", hosts: ["jobs.ashbyhq.com"], id: (s) => s[1] },
  { ats: "workable", hosts: ["apply.workable.com"], id: (s) => (s[1] === "j" ? s[2] : undefined) },
  { ats: "smartrecruiters", hosts: ["jobs.smartrecruiters.com"], id: (s) => s[1] },
  { ats: "workday", hosts: [], id: (s) => last(s)?.match(/_(R?\d+)$/)?.[1] },
]

export function detectAts(url: URL): AtsInfo | null {
  const host = url.hostname.toLowerCase()
  const segs = url.pathname.split("/").filter(Boolean)
  for (const a of ADAPTERS) {
    if (a.hosts.includes(host) || (a.ats === "workday" && host.endsWith(".myworkdayjobs.com"))) {
      const id = a.id(segs, url)
      return { ats: a.ats, externalId: id && id.length <= 200 ? id : undefined }
    }
  }
  return null
}

export function detectAtsFromString(raw: string): AtsInfo | null {
  const u = parseUrl(raw)
  return u ? detectAts(u) : null
}

const exact = (host: string): HostRule => ({ host, subdomains: false })
const bundled = (id: string, name: string, hosts: string[], patterns: string[], ats?: string): SiteConfig => ({
  id: `bundled:${id}`,
  name,
  ats,
  hosts: hosts.map(exact),
  patterns: patterns.map((path, i) => ({ id: `${id}-${i}`, path, query: [], fields: {} })),
  enabled: true,
  version: 1,
  updatedAt: "2026-11-01T00:00:00.000Z",
  bundled: true,
})

/**
 * Sites the extension recognizes out of the box. These carry URL patterns only: the page structure of a site is
 * learned from the user's own selections (or read from schema.org data), never assumed here.
 */
export const BUNDLED_SITES: SiteConfig[] = [
  bundled("surelyremote", "Surely Remote", ["jobs.surelyremote.com"], ["/job/view/:jobId"]),
  bundled("greenhouse", "Greenhouse", ["boards.greenhouse.io", "job-boards.greenhouse.io"], ["/:board/jobs/:jobId"], "greenhouse"),
  bundled("lever", "Lever", ["jobs.lever.co"], ["/:company/:jobId"], "lever"),
  bundled("ashby", "Ashby", ["jobs.ashbyhq.com"], ["/:company/:jobId"], "ashby"),
  bundled("workable", "Workable", ["apply.workable.com"], ["/:company/j/:jobId"], "workable"),
  bundled("smartrecruiters", "SmartRecruiters", ["jobs.smartrecruiters.com"], ["/:company/:jobId"], "smartrecruiters"),
]
