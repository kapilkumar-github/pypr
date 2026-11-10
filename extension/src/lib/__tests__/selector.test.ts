import { beforeEach, describe, expect, it } from "vitest"
import { cssEscape } from "../css"
import { find, generate, inOwnUi, looksGenerated } from "../selector"

const html = (s: string) => { document.body.innerHTML = s }
const q = (s: string) => document.querySelector(s)!

describe("selector generation", () => {
  beforeEach(() => html(""))

  it("prefers itemprop, then stable ids, then test attributes", () => {
    html(`<h1 itemprop="title" class="x">A</h1><div id="company-name">B</div><span data-testid="loc">C</span>`)
    expect(generate(q("h1"))!.primary).toBe('[itemprop="title"]')
    expect(generate(q("#company-name"))!.primary).toBe("#company-name")
    expect(generate(q("span"))!.primary).toBe('span[data-testid="loc"]')
  })

  it("skips generated ids and hashed classes", () => {
    html(`<main class="job-detail"><div id="r-9f8a7b6c5d" class="css-1x2y3z sc-bdnylx"><h2 class="title">T</h2></div></main>`)
    const g = generate(q("h2"))!
    expect(g.primary).not.toMatch(/9f8a|css-|sc-/)
    expect(document.querySelectorAll(g.primary)).toHaveLength(1)
  })

  it("recognizes machine-made tokens", () => {
    for (const t of ["css-1x2y3z", "sc-bdnylx", ":r1:", "a1b2c3d4e5f6g7h8", "Title_3fa9c", "123456", "jsx-12345"]) expect(looksGenerated(t), t).toBe(true)
    for (const t of ["job-title", "company", "posting-headline", "salary", "description"]) expect(looksGenerated(t), t).toBe(false)
  })

  it("scopes through a stable ancestor when the element has no unique signal", () => {
    html(`<section id="job"><p>one</p><p>two</p></section><section id="other"><p>x</p></section>`)
    const g = generate(document.querySelectorAll("#job p")[1]!)!
    expect(document.querySelectorAll(g.primary)).toHaveLength(1)
    expect(document.querySelector(g.primary)!.textContent).toBe("two")
    expect(g.primary).toContain("#job")
  })

  it("never puts the element's own text or a literal title in the selector", () => {
    html(`<div class="head"><h1 class="role">Senior Engineer</h1></div>`)
    expect(generate(q("h1"))!.primary).not.toMatch(/Senior|Engineer/)
  })

  it("avoids nth-child and absolute paths when something stable exists", () => {
    html(`<div class="wrap"><div class="a"><span class="company">Acme</span></div><div class="b"><span>x</span></div></div>`)
    const g = generate(q(".company"))!
    expect(g.primary).not.toMatch(/nth-/)
    expect(g.fragile).toBe(false)
  })

  it("falls back to position only as a last resort and says so", () => {
    html(`<div><div><span>a</span><span>b</span></div></div>`)
    const g = generate(document.querySelectorAll("span")[1]!)!
    expect(g.primary).toMatch(/nth-of-type/)
    expect(g.fragile).toBe(true)
    expect(document.querySelector(g.primary)!.textContent).toBe("b")
  })

  it("escapes awkward characters", () => {
    expect(cssEscape("a:b.c")).toBe("a\\:b\\.c")
    expect(cssEscape("1abc")).toBe("\\31 abc")
    html(`<div id="job:title">X</div><div data-testid='say "hi"' class="z">Y</div>`)
    expect(document.querySelector(generate(q("#job\\:title"))!.primary)!.textContent).toBe("X")
    expect(document.querySelector(generate(q(".z"))!.primary)!.textContent).toBe("Y")
  })

  it("gives a second selector to fall back on", () => {
    html(`<h1 itemprop="title" id="title" class="job-title">A</h1>`)
    const g = generate(q("h1"))!
    expect(g.fallbacks.length).toBeGreaterThan(0)
    for (const s of [g.primary, ...g.fallbacks]) expect(document.querySelector(s)).toBe(q("h1"))
  })

  it("never selects the extension's own UI", () => {
    html(`<pypr-extension-root><div class="inside">x</div></pypr-extension-root><p>real</p>`)
    expect(inOwnUi(q(".inside"))).toBe(true)
    expect(generate(q(".inside"))).toBeNull()
    expect(generate(q("pypr-extension-root"))).toBeNull()
    expect(find({ selector: ".inside", fallbacks: [], mode: "text" }).ok).toBe(false)
  })
})

describe("resolving a mapping", () => {
  beforeEach(() => html(`<h1 class="a">One</h1><p class="dup">1</p><p class="dup">2</p><a class="apply" href="/x">Go</a>`))

  it("finds a unique element", () => {
    const r = find({ selector: "h1.a", fallbacks: [], mode: "text", expectTag: "h1" })
    expect(r.ok && r.el.textContent).toBe("One")
  })
  it("does not pick one of several matches", () => {
    const r = find({ selector: ".dup", fallbacks: [], mode: "text" })
    expect(r).toMatchObject({ ok: false, reason: "ambiguous" })
  })
  it("reports a missing element, then uses a fallback when one exists", () => {
    expect(find({ selector: ".gone", fallbacks: [], mode: "text" })).toMatchObject({ ok: false, reason: "missing" })
    const r = find({ selector: ".gone", fallbacks: ["h1.a"], mode: "text" })
    expect(r.ok && r.usedFallback).toBe(true)
  })
  it("refuses an element of the wrong kind", () => {
    expect(find({ selector: "h1.a", fallbacks: [], mode: "text", expectTag: "h2" })).toMatchObject({ ok: false, reason: "mismatch" })
  })
  it("survives an invalid selector", () => {
    expect(find({ selector: "div[", fallbacks: [], mode: "text" }).ok).toBe(false)
  })
})
