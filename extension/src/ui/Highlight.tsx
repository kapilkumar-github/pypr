import { useEffect, useState } from "react"

interface Box { top: number; left: number; width: number; height: number }

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** Outlines page elements. Follows them through scrolling and resizing; drawn in our own layer, never on the page. */
export function Highlight({ target, kind, label }: { target: Element | null; kind: "hover" | "chosen"; label?: string }) {
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    if (!target) return setBox(null)
    let frame = 0
    let prev = ""
    const tick = () => {
      const b = boxOf(target)
      const s = `${b.top}|${b.left}|${b.width}|${b.height}`
      if (s !== prev) { prev = s; setBox(b) }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [target])
  if (!box || (box.width === 0 && box.height === 0)) return null
  const color = kind === "chosen" ? "var(--primary)" : "var(--warning)"
  return (
    <div aria-hidden style={{ position: "fixed", top: box.top - 2, left: box.left - 2, width: box.width + 4, height: box.height + 4, border: `2px ${kind === "chosen" ? "solid" : "dashed"} ${color}`, background: kind === "chosen" ? "color-mix(in oklch, var(--primary) 12%, transparent)" : "color-mix(in oklch, var(--warning) 10%, transparent)", borderRadius: 4, pointerEvents: "none" }}>
      {label && <span style={{ position: "absolute", top: -22, left: -2, background: color, color: "var(--primary-foreground)", font: "600 11px system-ui", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{label}</span>}
    </div>
  )
}
