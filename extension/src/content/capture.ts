import type { Field } from "@/lib/schema"
import { inOwnUi } from "@/lib/selector"

/**
 * What the user right-clicked, kept before the native menu opens. A menu click reports only the selected text, so
 * the element or range has to be remembered from the contextmenu event itself.
 */
export interface Captured {
  target: Element
  range: Range | null
  text: string
  at: number
}

let last: Captured | null = null

const elementOf = (n: Node | null): Element | null => (n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null)

export function startCapture(): () => void {
  const onMenu = (e: MouseEvent) => {
    const t = elementOf((e.composedPath()[0] as Node | undefined) ?? (e.target as Node))
    if (!t || inOwnUi(t)) return
    const sel = document.getSelection()
    const range = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null
    last = { target: t, range, text: (sel?.toString() ?? "").slice(0, 1000), at: Date.now() }
  }
  document.addEventListener("contextmenu", onMenu, true)
  return () => {
    document.removeEventListener("contextmenu", onMenu, true)
    last = null
  }
}

export const lastCapture = (): Captured | null => last

export type Proposal = { ok: true; el: Element; note?: string } | { ok: false; reason: string; pick: boolean }

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, div, section, article, tr, td, dd, dt, blockquote"

/** Counts block-level elements the selection touches. Many of them means it spans unrelated parts of the page. */
function blocksTouched(range: Range): number {
  const root = elementOf(range.commonAncestorContainer)
  if (!root) return 0
  let n = 0
  for (const el of root.querySelectorAll(BLOCKS)) if (range.intersectsNode(el)) n++
  return n
}

/**
 * Chooses the element for a field from the remembered right-click. A selection that stays inside one element maps
 * to that element. One that spans unrelated blocks is refused (except for descriptions, which are expected to span
 * several paragraphs) so the user picks the element instead of getting an arbitrary container.
 */
export function proposeFor(field: Field, c: Captured | null): Proposal {
  if (!c || Date.now() - c.at > 10 * 60_000) return { ok: false, reason: "Right-click the element on the page first, then choose Pypr → Use as.", pick: true }
  let el: Element | null
  if (c.range) {
    el = elementOf(c.range.commonAncestorContainer)
    if (!el || inOwnUi(el)) return { ok: false, reason: "That selection isn't part of the page.", pick: true }
    if (el === document.body || el === document.documentElement) return { ok: false, reason: "The selection spans the whole page. Use the picker to choose one element.", pick: true }
    if (field !== "description" && blocksTouched(c.range) >= 4) return { ok: false, reason: "The selection spans several unrelated elements. Use the picker to choose one.", pick: true }
  } else el = c.target
  if (field === "applicationUrl") {
    const a = el.closest("a[href]") ?? (el.querySelectorAll("a[href]").length === 1 ? el.querySelector("a[href]") : null)
    if (!a) return { ok: false, reason: "That isn't a link. Right-click the Apply link, or use the picker.", pick: true }
    return { ok: true, el: a }
  }
  if (el.localName === "html" || el.localName === "body") return { ok: false, reason: "Choose a more specific element.", pick: true }
  return { ok: true, el, note: c.range && field === "description" ? "Showing the container around your selection. Use Parent to widen it." : undefined }
}
