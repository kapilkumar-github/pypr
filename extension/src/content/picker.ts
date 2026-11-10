import { inOwnUi } from "@/lib/selector"

export interface Picker {
  stop(): void
}

const BLOCKED = ["mousedown", "mouseup", "pointerdown", "pointerup", "click", "dblclick", "auxclick", "contextmenu", "touchstart", "touchend", "submit", "dragstart", "selectstart"] as const

const targetOf = (e: Event): Element | null => {
  const t = e.composedPath()[0]
  return t instanceof Element ? t : t instanceof Node ? t.parentElement : null
}

/**
 * Visual element picker. While it runs, hovering reports the element under the pointer and a click chooses it.
 * Page handlers never see the click (events are stopped in the capture phase on window), so a link or button
 * underneath isn't activated. Escape cancels. The extension's own UI is left alone so its buttons still work.
 */
export function startPicker(cb: { onHover(el: Element | null): void; onPick(el: Element): void; onCancel(): void }): Picker {
  let hovered: Element | null = null
  const ours = (e: Event) => e.composedPath().some((n) => n instanceof Element && n.localName === "pypr-extension-root")
  const block = (e: Event) => {
    if (ours(e)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  const move = (e: MouseEvent) => {
    if (ours(e)) return cb.onHover(null)
    const t = targetOf(e)
    hovered = t && !inOwnUi(t) && t !== document.documentElement ? t : null
    cb.onHover(hovered)
  }
  const click = (e: MouseEvent) => {
    if (ours(e)) return
    block(e)
    const t = targetOf(e)
    if (t && !inOwnUi(t) && t !== document.documentElement) cb.onPick(t)
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopImmediatePropagation()
      cb.onCancel()
    } else if (e.key === "ArrowUp" && hovered?.parentElement && hovered.parentElement !== document.documentElement) {
      e.preventDefault()
      e.stopImmediatePropagation()
      hovered = hovered.parentElement
      cb.onHover(hovered)
    }
  }
  const opts = { capture: true } as const
  window.addEventListener("mousemove", move, opts)
  window.addEventListener("click", click, opts)
  window.addEventListener("keydown", key, opts)
  for (const t of BLOCKED) if (t !== "click") window.addEventListener(t, block, { capture: true, passive: false })
  const prev = document.documentElement.style.cursor
  document.documentElement.style.cursor = "crosshair"
  return {
    stop() {
      window.removeEventListener("mousemove", move, opts)
      window.removeEventListener("click", click, opts)
      window.removeEventListener("keydown", key, opts)
      for (const t of BLOCKED) if (t !== "click") window.removeEventListener(t, block, { capture: true } as EventListenerOptions)
      document.documentElement.style.cursor = prev
    },
  }
}
