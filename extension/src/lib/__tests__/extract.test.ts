import { beforeEach, describe, expect, it } from "vitest"
import { extract, missing, readMapping, toForm } from "../extract"
import { parseArrangement, parseSalary, htmlToText, structuredText } from "../text"
import type { PagePattern } from "../schema"

const page = (body: string, head = "") => { document.head.innerHTML = head; document.body.innerHTML = body }
const ld = (o: unknown) => `<script type="application/ld+json">${typeof o === "string" ? o : JSON.stringify(o)}</script>`
const url = new URL("https://jobs.example.com/job/view/SR1")
const posting = { "@type": "JobPosting", title: "Backend Engineer", hiringOrganization: { name: "Acme" }, jobLocation: { address: { addressLocality: "Berlin", addressCountry: "DE" } }, employmentType: "FULL_TIME", description: "<p>Build <b>things</b>.</p><ul><li>Go</li><li>SQL</li></ul>", identifier: { value: "REQ-77" }, url: "https://jobs.example.com/job/view/SR1" }

describe("structured data", () => {
  beforeEach(() => page(""))
  it("reads a JobPosting", () => {
    page(ld(posting))
    const x = extract(document, url)
    expect(x.values.title?.value).toBe("Backend Engineer")
    expect(x.values.company?.value).toBe("Acme")
    expect(x.values.location?.value).toBe("Berlin, DE")
    expect(x.values.employmentType?.value).toBe("Full-time")
    expect(x.values.description?.value).toBe("Build things.\n\n• Go\n• SQL")
    expect(x.externalId).toBe("REQ-77")
    expect(x.values.title?.origin).toBe("structured")
  })
  it("finds postings in arrays and @graph", () => {
    page(ld([{ "@type": "WebSite" }, { "@graph": [{ "@type": "Organization" }, posting] }]))
    expect(extract(document, url).values.title?.value).toBe("Backend Engineer")
  })
  it("survives malformed blocks", () => {
    page(ld("{ not json") + ld(posting) + ld("[1,2"))
    expect(extract(document, url).values.title?.value).toBe("Backend Engineer")
  })
  it("picks the posting for this page and never combines several", () => {
    const other = { ...posting, title: "Designer", url: "https://jobs.example.com/job/view/SR2", identifier: { value: "REQ-88" } }
    page(ld([other, posting]))
    expect(extract(document, url).values.title?.value).toBe("Backend Engineer")
    const x = extract(document, new URL("https://jobs.example.com/careers"))
    expect(x.values.title).toBeUndefined()
    expect(x.notes.join(" ")).toMatch(/2 job postings/)
  })
  it("uses the telecommute flag and structured salary only when stated", () => {
    page(ld({ ...posting, jobLocationType: "TELECOMMUTE", baseSalary: { currency: "USD", value: { minValue: 90000, maxValue: 120000, unitText: "YEAR" } } }))
    const f = toForm(extract(document, url), url)
    expect(f.workArrangement).toBe("remote")
    expect([f.salaryMin, f.salaryMax, f.salaryCurrency, f.salaryPeriod]).toEqual(["90000", "120000", "USD", "year"])
    page(ld(posting))
    const g = toForm(extract(document, url), url)
    expect([g.workArrangement, g.salaryText, g.salaryMin]).toEqual(["unknown", "", ""])
  })
  it("reports missing fields instead of inventing them", () => {
    page("<div>nothing here</div>")
    const f = toForm(extract(document, url), url)
    expect(f.title).toBe("")
    expect(missing(f).required).toEqual(["Job title", "Company"])
  })
})

describe("mappings take priority", () => {
  const pattern: PagePattern = { id: "p", path: "/job/view/:jobId", query: [], fields: {
    title: { selector: ".role", fallbacks: [], mode: "text" },
    applicationUrl: { selector: "a.apply", fallbacks: [], mode: "attr", attr: "href" },
    description: { selector: "#desc", fallbacks: [], mode: "html" },
  } }
  it("prefers the mapped element over structured data", () => {
    page(ld(posting) + `<base href="https://jobs.example.com/job/view/SR1"><h1 class="role"> Staff  Engineer </h1><a class="apply" href="/apply/1">Apply</a><div id="desc"><p>Hi</p><p>There</p></div>`)
    const x = extract(document, url, { pattern, params: { jobId: "SR1" } })
    expect(x.values.title).toMatchObject({ value: "Staff Engineer", origin: "mapping" })
    expect(x.values.applicationUrl?.value).toBe("https://jobs.example.com/apply/1")
    expect(x.values.description?.value).toBe("Hi\n\nThere")
    expect(x.values.company?.origin).toBe("structured")
  })
  it("shows a failure for a broken selector and does not use unrelated content", () => {
    page(`<h1>Some other heading</h1>`)
    const x = extract(document, url, { pattern })
    expect(x.values.title).toBeUndefined()
    expect(x.failures.title).toMatchObject({ reason: "missing" })
  })
  it("flags an ambiguous selector", () => {
    page(`<h1 class="role">A</h1><h2 class="role">B</h2>`)
    expect(extract(document, url, { pattern }).failures.title?.reason).toBe("ambiguous")
  })
  it("rejects non-http application links", () => {
    page(`<a class="apply" href="javascript:alert(1)">Apply</a>`)
    const r = readMapping("applicationUrl", pattern.fields.applicationUrl!, document)
    expect(r.ok).toBe(false)
    page(`<a class="apply" href="data:text/html,x">Apply</a>`)
    expect(readMapping("applicationUrl", pattern.fields.applicationUrl!, document).ok).toBe(false)
  })
  it("falls back to generic signals only when there is no mapping", () => {
    page(`<h1>Plain Title</h1>`, `<meta property="og:site_name" content="Acme Careers">`)
    const x = extract(document, url)
    expect(x.values.title).toMatchObject({ value: "Plain Title", origin: "generic" })
    expect(x.values.company?.value).toBe("Acme Careers")
  })
})

describe("hostile page content", () => {
  it("never carries markup or script text into a field", () => {
    page(`<div id="desc"><script>alert(1)</script><style>.a{}</style><p>Safe <img src=x onerror=alert(1)> text</p><div hidden>secret</div><input value="pw"></div>`)
    const t = structuredText(document.getElementById("desc")!)
    expect(t).toBe("Safe text")
    expect(htmlToText(`<p>x</p><script>alert(1)</script><iframe src="//evil"></iframe>`)).toBe("x")
  })
  it("caps huge values", () => {
    page(`<div id="d">${"word ".repeat(100_000)}</div>`)
    expect(structuredText(document.getElementById("d")!, 1000).length).toBeLessThanOrEqual(1000)
  })
  it("ignores the extension's own UI when reading", () => {
    page(`<pypr-extension-root><h1 class="role">Injected</h1></pypr-extension-root><h1 class="role">Real</h1>`)
    const r = readMapping("title", { selector: ".role", fallbacks: [], mode: "text" }, document)
    expect(r.ok && r.value).toBe("Real")
  })
})

describe("text parsing", () => {
  it("reads arrangements only when explicit and unambiguous", () => {
    expect(parseArrangement("Remote (US)")).toBe("remote")
    expect(parseArrangement("Hybrid - 3 days in office")).toBe("hybrid")
    expect(parseArrangement("On-site")).toBe("onsite")
    expect(parseArrangement("Remote or hybrid")).toBe("unknown")
    expect(parseArrangement("Berlin")).toBe("unknown")
  })
  it("reads salary numbers only with a currency or period", () => {
    expect(parseSalary("USD 80,000 - 100,000 per year")).toEqual({ min: 80000, max: 100000, currency: "USD", period: "year" })
    expect(parseSalary("£45k–£55k")).toEqual({ min: 45000, max: 55000, currency: "GBP", period: "" })
    expect(parseSalary("$50 - $60 / hour")).toEqual({ min: 50, max: 60, currency: "", period: "hour" })
    expect(parseSalary("5 years of experience")).toBeNull()
    expect(parseSalary("Competitive")).toBeNull()
  })
})

describe("what Pypr will not read", () => {
  const m = (selector: string) => ({ selector, fallbacks: [], mode: "text" as const })
  it("refuses form fields", () => {
    page(`<form><input class="a" value="secret"><textarea class="b">answer</textarea><select class="c"><option>x</option></select></form><div contenteditable="true" class="d">typed</div>`)
    for (const s of [".a", ".b", ".c", ".d", "form"]) expect(readMapping("title", m(s), document), s).toMatchObject({ ok: false, failure: { detail: "Pypr doesn't read form fields." } })
  })
  it("names frames and shadow DOM when it can't see a job", async () => {
    const { limitations } = await import("../extract")
    page(`<iframe src="https://other.example/job"></iframe>`)
    expect(limitations(document).join(" ")).toMatch(/frame/)
    page(`<job-card></job-card>`)
    expect(limitations(document).join(" ")).toMatch(/shadow DOM/)
    page(`<h1>Plain</h1>`)
    expect(limitations(document)).toEqual([])
  })
})
