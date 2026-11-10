import { cssEscape, cssString } from "./css"
import type { FieldMapping, Mode } from "./schema"

/** Tag of the extension's own UI host. Nothing inside it is ever picked, mapped or read. */
export const HOST_TAG = "pypr-extension-root"

export const inOwnUi = (el: Element | null): boolean => !!el && (el.localName === HOST_TAG || !!el.closest(HOST_TAG))

const DATA_ATTRS = ["data-testid", "data-test-id", "data-test", "data-qa", "data-cy", "data-automation-id", "data-automation", "data-field", "data-role", "data-name", "data-section", "data-component", "data-ui"]
const STATE_CLASS = /^(active|selected|open|opened|closed|show|shown|hidden|visible|disabled|hover|focus|focused|current|loading|loaded|collapsed|expanded|is-.+|has-.+|js-.+)$/i

/** True for tokens that look machine-made: hashes, counters, generated component names. */
export function looksGenerated(token: string): boolean {
  if (token.length > 40) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(token) || /^:r?[0-9a-z]+:$/i.test(token)) return true
  if (/\d{4,}/.test(token)) return true
  if (/^(css|sc|jsx|svelte|ember|react|radix|mui|chakra|styled|emotion|ng|v)-/i.test(token) && /[0-9a-z]{5,}$/i.test(token)) return true
  if (/_[A-Za-z0-9]{5,}$/.test(token) && /\d/.test(token.slice(-6))) return true
  const tail = token.split(/[-_]/).pop() ?? token
  if (tail.length >= 6 && /\d/.test(tail) && /[a-z]/i.test(tail)) return true
  if (token.length >= 6 && !/[aeiouy-]/i.test(token) && !token.includes("_")) return true
  return false
}

const count = (root: ParentNode, sel: string): number => {
  try {
    return root.querySelectorAll(sel).length
  } catch {
    return 0
  }
}

function stableClasses(el: Element): string[] {
  return [...el.classList].filter((c) => !looksGenerated(c) && !STATE_CLASS.test(c) && /^[A-Za-z_-][\w-]*$/.test(c))
}

/** Selectors that describe `el` alone, best first. They may match other elements too. */
function local(el: Element): string[] {
  const tag = el.localName
  const out: string[] = []
  const prop = el.getAttribute("itemprop")
  if (prop && !looksGenerated(prop)) out.push(`[itemprop="${cssString(prop)}"]`)
  const id = el.getAttribute("id")
  if (id && !looksGenerated(id)) out.push(`#${cssEscape(id)}`)
  for (const a of DATA_ATTRS) {
    const v = el.getAttribute(a)
    if (v && !looksGenerated(v) && v.length < 60) out.push(`${tag}[${a}="${cssString(v)}"]`)
  }
  const cls = stableClasses(el)
  for (const c of cls.slice(0, 4)) out.push(`${tag}.${cssEscape(c)}`)
  if (cls.length > 1) out.push(tag + cls.slice(0, 3).map((c) => "." + cssEscape(c)).join(""))
  return out
}

export interface Generated {
  primary: string
  fallbacks: string[]
  /** The selector depends on element position. Likely to break when the page changes. */
  fragile: boolean
}

function nthPath(el: Element, stop: Element | null): string {
  const steps: string[] = []
  for (let cur: Element | null = el; cur && cur !== stop && cur.localName !== "html"; cur = cur.parentElement) {
    const tag = cur.localName
    const same = cur.parentElement ? [...cur.parentElement.children].filter((c) => c.localName === tag) : []
    steps.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag)
    if (cur.localName === "body") break
  }
  return steps.join(" > ")
}

/**
 * Builds a selector for `el` that matches only it. Prefers semantic attributes, stable IDs, test attributes and
 * stable classes, then a stable ancestor plus a short path. Position-only selectors come last and are marked fragile.
 * Never uses the element's text, so a selector made on one job still fits the next.
 */
export function generate(el: Element, root: Document = el.ownerDocument): Generated | null {
  if (inOwnUi(el) || el === root.documentElement) return null
  const unique: string[] = []
  const add = (s: string) => {
    if (!unique.includes(s) && count(root, s) === 1 && root.querySelector(s) === el) unique.push(s)
  }
  for (const s of local(el)) add(s)

  // Anchor on a stable ancestor and describe the way down.
  if (unique.length === 0) {
    let depth = 0
    for (let a = el.parentElement; a && a !== root.documentElement && depth < 8; a = a.parentElement, depth++) {
      const anchors = local(a).filter((s) => count(root, s) === 1)
      if (anchors.length === 0) continue
      const anchor = anchors[0]!
      const here = [...local(el), el.localName]
      for (const l of here) add(`${anchor} ${l}`)
      // Add intermediate levels, nearest first, until the selector is unique.
      const mid: Element[] = []
      for (let m = el.parentElement; m && m !== a; m = m.parentElement) mid.push(m)
      for (const l of here) {
        let chain = l
        for (const m of mid) {
          const step = local(m)[0] ?? m.localName
          chain = `${step} > ${chain}`
          add(`${anchor} ${chain}`)
          if (unique.length) break
        }
        if (unique.length) break
      }
      if (unique.length === 0) add(`${anchor} > ${nthPath(el, a)}`.replace(/^(.+?) > (.+)$/, "$1 > $2"))
      if (unique.length === 0) add(`${anchor} ${nthPath(el, a)}`)
      if (unique.length) break
    }
  }
  if (unique.length === 0) add(nthPath(el, null))
  const [primary, ...rest] = unique
  if (!primary) return null
  return { primary, fallbacks: rest.slice(0, 2), fragile: /:nth-/.test(primary) }
}

export type Resolved =
  | { ok: true; el: Element; selector: string; usedFallback: boolean }
  | { ok: false; reason: "missing" | "ambiguous" | "mismatch"; detail: string }

/** Finds the element for a mapping. A selector that matches several elements is not guessed at. */
export function find(m: FieldMapping, root: ParentNode = document): Resolved {
  let reason: "missing" | "ambiguous" | "mismatch" = "missing"
  let detail = "Nothing on this page matches the saved selector."
  const sels = [m.selector, ...m.fallbacks]
  for (let i = 0; i < sels.length; i++) {
    let found: Element[] = []
    try {
      found = [...root.querySelectorAll(sels[i]!)].filter((e) => !inOwnUi(e))
    } catch {
      continue
    }
    if (found.length === 0) continue
    if (found.length > 1) {
      if (reason === "missing") {
        reason = "ambiguous"
        detail = `The saved selector matches ${found.length} elements, so none was used.`
      }
      continue
    }
    const el = found[0]!
    if (m.expectTag && el.localName !== m.expectTag) {
      reason = "mismatch"
      detail = `Expected a <${m.expectTag}> but found a <${el.localName}>.`
      continue
    }
    return { ok: true, el, selector: sels[i]!, usedFallback: i > 0 }
  }
  return { ok: false, reason, detail }
}

/** Default way to read each kind of element. */
export function defaultMode(field: string, el: Element): { mode: Mode; attr?: string } {
  if (field === "applicationUrl") return { mode: "attr", attr: "href" }
  if (field === "description") return { mode: "html" }
  void el
  return { mode: "text" }
}

/** Rebuilds a mapping from a chosen element. */
export function mappingFor(field: string, el: Element, g: Generated): FieldMapping {
  const { mode, attr } = defaultMode(field, el)
  return { selector: g.primary, fallbacks: g.fallbacks, mode, attr, expectTag: el.localName }
}
