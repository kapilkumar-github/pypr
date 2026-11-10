"use client"

import { useRef } from "react"
import { Minus, StickyNote, X } from "lucide-react"

import { type BoardNote } from "@/lib/api/design"
import { cn } from "@/lib/utils"

export const NFR_ID = "nfr"
export const ESTIMATE_ID = "estimate"
const MIN_W = 220
const MIN_H = 120

/** The two notes every board starts with. The learner fills them in: nobody gives them the numbers. */
export function defaultNotes(): BoardNote[] {
  return [
    {
      id: NFR_ID,
      title: "Non-functional requirements",
      text: "Availability: \nLatency (p99): \nConsistency: \nDurability: \nOther: ",
      x: 16,
      y: 16,
      w: 300,
      h: 190,
      open: true,
    },
    {
      id: ESTIMATE_ID,
      title: "Back-of-envelope estimation",
      text: "DAU: \nRequests/s (avg, peak): \nRead : write ratio: \nStorage per year: \nBandwidth: \n\nWorking:\n",
      x: 16,
      y: 230,
      w: 300,
      h: 260,
      open: true,
    },
  ]
}

type Props = {
  notes: BoardNote[]
  onChange: (next: BoardNote[]) => void
}

/** Floating notes over the canvas: drag by the title, minimize to the dock, close to delete. Pointer events only, no dependency. */
export function FloatingNotes({ notes, onChange }: Props) {
  const area = useRef<HTMLDivElement>(null)
  const patch = (id: string, p: Partial<BoardNote>) => onChange(notes.map((n) => (n.id === id ? { ...n, ...p } : n)))

  const drag = (e: React.PointerEvent, n: BoardNote) => {
    if ((e.target as HTMLElement).closest("button")) return
    e.preventDefault()
    const box = area.current?.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y }
    const move = (ev: PointerEvent) => {
      const x = Math.min(Math.max(0, start.nx + ev.clientX - start.x), Math.max(0, (box?.width ?? 800) - 60))
      const y = Math.min(Math.max(0, start.ny + ev.clientY - start.y), Math.max(0, (box?.height ?? 600) - 32))
      patch(n.id, { x, y })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  // The textarea's own resize handle changes its size; keep it in the saved note.
  const sized = (n: BoardNote, el: HTMLElement) => {
    const w = Math.max(MIN_W, Math.round(el.offsetWidth))
    const h = Math.max(MIN_H, Math.round(el.offsetHeight))
    if (Math.abs(w - n.w) > 2 || Math.abs(h - n.h) > 2) patch(n.id, { w, h })
  }

  const minimized = notes.filter((n) => !n.open)
  return (
    <div ref={area} className="pointer-events-none absolute inset-0 z-10 hidden overflow-hidden lg:block" aria-label="Notes">
      {notes
        .filter((n) => n.open)
        .map((n) => (
          <section
            key={n.id}
            role="group"
            aria-label={n.title}
            className="pointer-events-auto absolute flex min-h-30 min-w-55 resize flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
            style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
            onPointerUp={(e) => sized(n, e.currentTarget)}
          >
            <header onPointerDown={(e) => drag(e, n)} className="flex cursor-grab touch-none items-center gap-1 border-b bg-muted/60 px-2 py-1 active:cursor-grabbing">
              <input
                value={n.title}
                onChange={(e) => patch(n.id, { title: e.target.value.slice(0, 60) })}
                aria-label="Note title"
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
              />
              <button type="button" onClick={() => patch(n.id, { open: false })} aria-label={`Minimize ${n.title}`} title="Minimize" className="rounded p-1 text-muted-foreground hover:bg-accent">
                <Minus className="size-3.5" />
              </button>
              <button type="button" onClick={() => onChange(notes.filter((x) => x.id !== n.id))} aria-label={`Delete ${n.title}`} title="Delete note" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                <X className="size-3.5" />
              </button>
            </header>
            <textarea
              value={n.text}
              onChange={(e) => patch(n.id, { text: e.target.value.slice(0, 4000) })}
              aria-label={`${n.title} text`}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent p-2 font-mono text-xs leading-relaxed outline-none"
            />
          </section>
        ))}
      {minimized.length > 0 && (
        <div className="pointer-events-auto absolute bottom-3 left-14 flex max-w-[60%] flex-wrap gap-1.5">
          {minimized.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => patch(n.id, { open: true })}
              className={cn("flex max-w-48 items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-sm hover:bg-accent")}
              title={`Open ${n.title}`}
            >
              <StickyNote className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{n.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
